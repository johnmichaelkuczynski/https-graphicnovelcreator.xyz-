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

# Browser video export gotcha (export.ts)
Exporting the slideshow to video uses a canvas `captureStream` + `MediaRecorder`, mixing audio via Web Audio `MediaStreamAudioDestinationNode`.
**Why:** if you `start()` the `AudioBufferSourceNode`s before `MediaRecorder.start()`, the beginning of the audio (or all of it, for short clips) is missing from the output.
**How to apply:** decode all audio buffers first, then call `recorder.start()`, THEN schedule the sources from a post-start base time (`audioCtx.currentTime + 0.1`). mp4 mime is rarely supported by MediaRecorder in Chrome — fall back to webm and name the file by the actual chosen mime.
