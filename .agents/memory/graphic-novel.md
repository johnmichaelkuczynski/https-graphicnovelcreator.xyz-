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

# Browser video export gotcha (export.ts)
Exporting the slideshow to video uses a canvas `captureStream` + `MediaRecorder`, mixing audio via Web Audio `MediaStreamAudioDestinationNode`.
**Why:** if you `start()` the `AudioBufferSourceNode`s before `MediaRecorder.start()`, the beginning of the audio (or all of it, for short clips) is missing from the output.
**How to apply:** decode all audio buffers first, then call `recorder.start()`, THEN schedule the sources from a post-start base time (`audioCtx.currentTime + 0.1`). mp4 mime is rarely supported by MediaRecorder in Chrome — fall back to webm and name the file by the actual chosen mime.
