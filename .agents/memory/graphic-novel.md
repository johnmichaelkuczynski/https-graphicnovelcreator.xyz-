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

# AI converter style consistency (non-negotiable)
Function 2 (Text→Graphic Novel) lets users bring their own OpenAI-compatible key (Venice/OpenAI). The user is furious if drawing style varies between panels.
**Rule:** compute the style prefix and a SINGLE seed ONCE in `convertTextToNovel`, then reuse both for every panel's image call. The LLM script step must be explicitly forbidden from emitting style/medium words — only scene content — or it reintroduces drift. There must be no per-panel style/seed override path.
**Why:** identical style across all panels is the whole point of the feature; a per-panel seed or LLM-emitted style words breaks it.

# Per-panel audio layering
Each `Panel` may carry its own `audioBlob`/`audioName`, layered OVER (not replacing) the sequence-wide audio tracks. Three places must stay in sync: `PanelItem` (attach/replace/remove UI), `PreviewPlayer` (separate `panelAudioRef`, restarted on panel change), and `export.ts` (decode panel buffers, schedule each at its cumulative panel start offset alongside sequence tracks).

# ElevenLabs character speech
Per-panel "make the character speak": user picks an ElevenLabs voice + the words, generates TTS, and the mp3 becomes that panel's `audioBlob` (reusing per-panel audio playback/export — no new playback path needed). Chosen `voiceId` persists on the panel.
**Key difference from the script/image proxy:** speech uses the APP's OWN ElevenLabs key from env (`ELEVEN_API_KEY` || `ELEVEN_LABS_API_KEY`), NOT bring-your-own. Host is fixed (`api.elevenlabs.io`), so no SSRF guard needed; routes are still Clerk-gated and 503 if the key is absent. ElevenLabs auth uses the `xi-api-key` header (not Bearer). Never log the upstream TTS error body — it can echo the user's text.
**Gotcha:** a popover's local edit state (e.g. the speech text defaulting to the caption) must re-sync from the panel on open via an effect, or it goes stale after the caption changes.

# AI proxy SSRF guard (api-server/routes/ai.ts)
The proxy forwards to a user-supplied `baseUrl`, so it is an SSRF vector even behind Clerk auth.
**Rule:** the guard is async and must RESOLVE DNS (`dns/promises` lookup, all addresses) and reject if ANY resolved IP is private/loopback/link-local/ULA/CGNAT/multicast — a hostname string check alone is defeated by public-looking domains pointing at internal IPs. Both `/ai/script` and `/ai/image` must `await isAllowedBaseUrl`.

# Browser video export gotcha (export.ts)
Exporting the slideshow to video uses a canvas `captureStream` + `MediaRecorder`, mixing audio via Web Audio `MediaStreamAudioDestinationNode`.
**Why:** if you `start()` the `AudioBufferSourceNode`s before `MediaRecorder.start()`, the beginning of the audio (or all of it, for short clips) is missing from the output.
**How to apply:** decode all audio buffers first, then call `recorder.start()`, THEN schedule the sources from a post-start base time (`audioCtx.currentTime + 0.1`). mp4 mime is rarely supported by MediaRecorder in Chrome — fall back to webm and name the file by the actual chosen mime.
