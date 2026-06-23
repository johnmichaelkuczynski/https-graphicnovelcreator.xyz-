---
name: Graphic Novel data model
description: Multi-project IndexedDB schema, migration rule, and browser-export gotchas for the graphic-novel artifact.
---

# Multi-project storage
The app stores everything client-side in IndexedDB (`novel-creator-db`). Stores: `projects`, `panels`, `audio_tracks`. Panels and audio tracks are scoped to a project via a `projectId` field + a `by-project` index. Current project selection lives in `localStorage` and is exposed through a React context (`project-context.tsx`).

**Rule:** any new per-project entity must carry `projectId` and a `by-project` index, and query keys must include the project id (e.g. `['panels', projectId]`) so switching projects refetches correctly.

# IndexedDB version bumps
The DB started at v1 as a single-project store (panels/audio with no `projectId`). v2 introduced projects.
**Why it matters:** users have real data in older versions. Any schema change MUST bump the version and add a migration in `upgrade()` that backfills existing records (v1→v2 assigns orphaned panels/audio to an auto-created default project) — never assume an empty DB, or you silently lose the user's work.
**How to apply:** idb's `upgrade(db, oldVersion, _new, tx)` can be async; read existing records with `tx.objectStore(...).getAll()` and re-`put` them with the new field, all inside the upgrade transaction.

# Backend-only AI keys (non-negotiable)
The user demanded — emphatically — that NO API keys ever appear in the browser and the user can NEVER input their own. There is no provider/key/baseUrl/model UI at all. All keys are env secrets used server-side only.
**Rule:** the client calls only our own auth-gated `/api/ai/*` and sends no keys, hosts, or model names. Providers are fixed in `ai.ts`: script = Anthropic `claude-sonnet-4-6` (Venice `llama-3.3-70b` chat fallback), images = Dezgo Flux `flux_1_schnell` (returns raw PNG bytes; client does `res.blob()`), speech = ElevenLabs. `/api/ai/config` returns only `{ready: boolean}` — never models or keys.
**Why:** the user reacted with fury to any client-side key surface; reintroducing one is a hard regression. Do not add BYOK back.
**Dezgo Flux gotcha:** schnell wants few steps — clamp steps to 1–8 and width/height to multiples of 64 ≤1024, or preset values (e.g. 1152, 25 steps) break the call. Discover valid Anthropic models via `GET /v1/models`; Dezgo models + functions via `GET /info` (Flux fn is `text2image_flux`).
**Dezgo img2img gotcha:** Flux has NO image2image on Dezgo — the `image2image` endpoint needs a Stable-Diffusion model (we use `realistic_vision_5_1`). It is `multipart/form-data` (init_image Blob + prompt + strength 0–1) with the `X-Dezgo-Key` header; do NOT set Content-Type manually (let fetch set the multipart boundary). Returns raw PNG.

# Edit Photo (img2img) feature
Separate from the text→novel flow: upload any image + describe a change in plain words → `/api/ai/edit` (Dezgo image2image). The route uses `express.raw` for the image body (bypasses the global `express.json` 100kb limit) with prompt/strength as query params, and is Clerk-gated like the rest of `/api/ai/*`. Client downscales (longest edge ≤1024, multiples of 8) before posting to keep upload small.
**Why query params for prompt:** edit instructions are short, so URL length is a non-issue; switching to multipart would add a body parser just for two short strings.

# AI converter style consistency (non-negotiable)
The user is furious if drawing style varies between panels.
**Rule:** compute the style prefix and a SINGLE seed ONCE in `convertTextToNovel`, then reuse both for every panel's image call. The LLM script step must be explicitly forbidden from emitting style/medium words — only scene content — or it reintroduces drift. There must be no per-panel style/seed override path.
**Why:** identical style across all panels is the whole point of the feature; a per-panel seed or LLM-emitted style words breaks it.

# Per-panel audio layering
Each `Panel` may carry its own `audioBlob`/`audioName`, layered OVER (not replacing) the sequence-wide audio tracks. Three places must stay in sync: `PanelItem` (attach/replace/remove UI), `PreviewPlayer` (separate `panelAudioRef`, restarted on panel change), and `export.ts` (decode panel buffers, schedule each at its cumulative panel start offset alongside sequence tracks).

# ElevenLabs character speech
Per-panel "make the character speak": user picks an ElevenLabs voice + the words, generates TTS, and the mp3 becomes that panel's `audioBlob` (reusing per-panel audio playback/export — no new playback path needed). Chosen `voiceId` persists on the panel.
Speech uses the app's ElevenLabs key from env (`ELEVEN_API_KEY` || `ELEVEN_LABS_API_KEY`); host fixed (`api.elevenlabs.io`); routes Clerk-gated and 503 if absent. ElevenLabs auth uses the `xi-api-key` header (not Bearer). Never log the upstream TTS error body — it can echo the user's text.
**Gotcha:** a popover's local edit state (e.g. the speech text defaulting to the caption) must re-sync from the panel on open via an effect, or it goes stale after the caption changes.

# Browser video export — use deterministic WebCodecs, NOT real-time capture (export.ts)
**Decision:** the primary video export path is deterministic WebCodecs (`VideoEncoder` VP9 `vp09.00.10.08`, VP8 fallback, + `webm-muxer`), encoding every frame as fast as the CPU allows with explicit µs timestamps/durations. Audio is mixed offline with `OfflineAudioContext` (sequence tracks back-to-back from 0; per-panel audio at cumulative panel starts) then `AudioEncoder` Opus, fed as `f32-planar` `AudioData`. `MediaRecorder` survives only as a fallback for browsers with NO `VideoEncoder`.
**Why (a recurring, hard-to-diagnose failure):** `canvas.captureStream()` + `MediaRecorder` is REAL-TIME — the browser stops compositing the canvas into the stream when the preview/tab loses focus, so the last visible frame is held for the rest of the recording ("frozen on panel 3 for the whole video", "only the first third"). No timer/duration tweak fixes this; real-time capture is fundamentally unfit for long exports. WebCodecs is decoupled from the wall clock and tab focus, so backgrounding can't freeze it.
**How to apply:**
- Eligibility for the WebCodecs path = symbols present AND a mux-compatible codec actually encodes. Probe `VideoEncoder.isConfigSupported` for VP9 then VP8 up front; if NEITHER is supported (Safari-class browsers expose `VideoEncoder` but no VP8/VP9), fall back to MediaRecorder instead of hard-failing. Checking symbol presence alone is NOT enough.
- Gate video and audio capability INDEPENDENTLY. A browser missing audio APIs (or Opus via `AudioEncoder.isConfigSupported`) must still get the robust video path (silent video), never a downgrade to MediaRecorder.
- Once committed to the WebCodecs path (codec probe succeeded), do NOT silently swallow runtime encode errors and fall back — that downgrade is exactly what masked the freeze; let them throw. Fallback is a pre-encode eligibility decision, not an error handler.
- Backpressure when `encodeQueueSize > 20`; `frame.close()`/`ad.close()` every chunk; wrap encoders in `try/finally` to `close()` on early throw.
- Legacy fallback gotchas still apply to the MediaRecorder path: drive frames with `setInterval` (never rAF) + independent `setTimeout` stop; patch the missing WebM duration header with `fix-webm-duration` using real elapsed ms; schedule audio sources only AFTER `recorder.start()`.

# Cross-project libraries (Images / Documents / Instructions)
Three GLOBAL (non-project-scoped) IndexedDB stores — `library_images`, `library_documents`, `library_instructions` — let users upload/write once and reuse across every project. Unlike panels/audio these carry NO `projectId` and need no `by-project` index; query keys are flat (`['library-images']` etc.).
**Rule:** these are user content, so they MUST be wiped in `clearAllData()` on Clerk account switch alongside projects/panels/audio — forgetting one leaks data across accounts.
**Reuse points (keep wired):** Studio "Add Panels" → "From Library" picker (`LibraryImagePicker`) adds selected library images as panels (next order = max+1); ConvertDialog "From Library"/"Save to Library" for the source document (`sourceText` ↔ LibraryDocument) and the instruction (`outputSpec` ↔ LibraryInstruction). The store bump that added these was v4→v5 (additive, `!contains` guarded, no data migration).

# Export self-test diagnostic (diagnostics.ts + DiagnosticsDialog.tsx)
An always-enabled "Self-Test" header button (standalone — NOT inside the panel-gated Download menu, or it's unreachable with 0 panels) builds synthetic novels (1/3/8/24 panels, distinct solid-color frames, ±synthetic WAV audio), renders each via `renderVideoBlob`, then DECODES the produced webm in a `<video>`: asserts duration ≈ expected and seeks each panel midpoint, samples avg frame color, and asserts consecutive panels DIFFER (`colorDist < 12` ⇒ frozen ⇒ fail). This is the regression oracle for the freeze bug — keep it working. `renderVideoBlob(panels, tracks, onProgress)` returns `{blob, ext}`; `exportVideo` wraps it + downloads.

# Auto-create-on-empty must read IndexedDB directly, not the react-query cache
The "ensure at least one project" bootstrap in `project-context.tsx` creates "My First Project" when the projects list is empty. It must re-read `dbApi.getProjects()` straight from IndexedDB *inside* the create guard and skip creation if the DB actually has projects.
**Why:** the react-query `['projects']` cache can transiently read empty (multi-tab, a version-change/blocked DB open, or refetch latency) even though projects exist — auto-creating off that stale-empty produced a flood of dozens of duplicate "My First Project" entries that the user could not get rid of. A ref guard alone does not cover it because the empty can recur across loads.
**How to apply:** any "create a default X if none exist" effect backed by a cached query must confirm emptiness against the source of truth (IndexedDB here) before writing. Not fully duplicate-proof under true concurrent multi-tab creation (no DB-level lock), but covers the stale-cache cause.

# Project switcher dropdown ordering (Studio.tsx)
Put the New/Manage actions ABOVE the project list, and wrap the list in a `max-h-64 overflow-y-auto` div. **Why:** with many projects the list pushed New/Rename/Delete below the fold, making them unreachable — the user concluded there was "no way to name or delete projects" when the features existed all along (rename + multi-select delete live in `ProjectsDialog`). New projects are named via a dialog (`showNewProject`), not silent auto-naming.

# PDF export must downscale + yield (export.ts exportPdf)
PDF export ("Building PDF…") froze forever on real decks of large photos. `exportPdf` draws each panel image to a canvas and `toDataURL('image/jpeg')`s it; at full source resolution across many large photos that blocks the main thread / OOMs with no error.
**Rule:** cap each image's longest edge (~1600px) before drawing, encode JPEG at ~0.85, lay out from the downscaled dimensions, `await` a rAF between pages so the overlay paints, report progress, and wrap each panel's image in try/catch (one unreadable blob must not abort the whole export). Throw a clear message if zero images rendered.
**Why:** there was no progress and no error path, so a slow/frozen export was indistinguishable from a dead one.

# Sonner Toaster was never mounted — error toasts silently vanished
The app mounts the shadcn `Toaster` (`@/components/ui/toaster`, driven by `useToast`) in App.tsx, but several call sites use `toast` from `sonner`. The sonner `<Toaster>` (`@/components/ui/sonner`) must ALSO be mounted in App.tsx or every `sonner` toast (export success/failure, create-project errors) renders nothing.
**Rule:** if you call `toast` from `sonner`, confirm `<SonnerToaster />` is mounted; the two toast systems are independent and only the one whose provider is mounted will show.

# Multi-image panels (1–4 photos per panel)
A panel can hold up to MAX_PANEL_IMAGES (4) photos; default 1. Storage keeps `imageBlob` as the always-present FIRST image and adds optional `extraImages?: Blob[]` (images 2..N) — this means NO IndexedDB version bump / migration (old single-image rows just lack `extraImages`). `getPanelImages(panel)` in db.ts is the single source of truth (primary + extras, capped at 4); every reader (grid, slideshow, PDF, video) must go through it, never read `imageBlob` directly for display/export.
Rendering is unified by `ImageCollage` (BlobMedia.tsx): 1 = cover-fill, 2 = side-by-side, 3 = two-up + full-width bottom, 4 = 2x2. Canvas/PDF mirror this via `collageRects` + `drawImageCover` in export.ts. Single-image keeps its old "fit/contain" path in preview + PDF to avoid visual regressions.
**Gotcha:** pass a STABLE array to ImageCollage (useMemo keyed on `panel.imageBlob`+`panel.extraImages`) or `useObjectUrls` recreates/revokes object URLs every render → flicker.
