# Graphic Novel Creator

A browser-based studio for assembling graphic novels from your own uploaded images, captions, and audio — arrange panels, score them with audio tracks, and play the result as a slideshow.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/graphic-novel/` — the React + Vite studio (web app, served at `/`).
  - `src/lib/db.ts` — IndexedDB schema (projects / panels / audio_tracks), source of truth for the data model.
  - `src/lib/ai-client.ts` — Text→Novel conversion logic (script + image generation, style consistency).
  - `src/lib/style-presets.ts` — drawing-style presets (incl. token-light `stick`).
  - `src/lib/ai-settings.ts` — per-user AI provider config (baseUrl/key/model) in localStorage.
  - `src/lib/export.ts` — PDF + video export, including audio mixing.
  - `src/components/ConvertDialog.tsx` — the Text→Novel form (incl. PDF/.docx/TXT upload into source text).
  - `src/lib/text-extract.ts` — client-side document text extraction (pdfjs-dist + mammoth, lazy-loaded).
  - `src/components/SpeakControl.tsx` — per-panel ElevenLabs character voice picker.
  - `src/lib/tts-client.ts` — calls the speech endpoints.
- `artifacts/api-server/src/routes/ai.ts` — auth-gated AI routes: bring-your-own-key proxy (`/api/ai/script`, `/api/ai/image`) and app-key ElevenLabs speech (`/api/ai/voices`, `/api/ai/tts`).

## Architecture decisions

- **Bring-your-own-key AI.** Users supply their own OpenAI-compatible provider (Venice/OpenAI). The key never persists server-side; the server only proxies a single request (auth-gated, SSRF-guarded) so the browser doesn't leak the key cross-origin or hit CORS.
- **Style consistency is enforced, not requested.** A fixed style prefix + a single shared seed are applied to every panel's image call, and the LLM is forbidden from emitting style words. See `.agents/memory/graphic-novel.md`.
- **Everything client-side.** All novel data lives in the browser's IndexedDB; there is no server database for user content.
- **Per-panel audio layers over sequence audio** in both live preview and video export.

## Product

Graphic Novel Creator is a browser studio with two ways to build a novel:
1. **Manual** — upload your own panel images, write captions, add sequence-wide audio, arrange, and play back as a slideshow; export to PDF or video.
2. **Text → Graphic Novel (AI)** — paste source text, describe the desired output, pick a drawing style (presets including a cheap token-light stick-figure mode), set panel count and per-panel duration, optionally add audio, and CONVERT into a fully generated novel with a consistent art style across all panels.

Per panel, users can attach an optional dedicated audio track that plays over the sequence soundtrack.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
