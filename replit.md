# Graphic Novel Creator

A browser-based studio for assembling graphic novels from your own uploaded images, captions, and audio — arrange panels, score them with audio tracks, and play the result as a slideshow.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` (Postgres), `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Google OAuth redirect URI to register in Google Cloud Console: `https://<domain>/api/auth/google/callback` (dev = `REPLIT_DEV_DOMAIN`; after deploy also add the `.replit.app` prod domain)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/graphic-novel/` — the React + Vite studio (web app, served at `/`).
  - `src/lib/db.ts` — IndexedDB schema (projects / panels / audio_tracks + the three global cross-project libraries: library_images / library_documents / library_instructions), source of truth for the data model.
  - `src/hooks/use-library.ts` — react-query hooks (query/save/delete) for the three cross-project libraries.
  - `src/pages/Library.tsx` — the `/library` page (3 tabs: Images / Documents / Instructions) for uploading/writing and managing reusable assets.
  - `src/components/LibraryImagePicker.tsx` — reusable saved-images picker (parameterized title/description/confirmLabel/maxSelect). Used both by Studio "Add Panels → From Library" (adds panels) and by a single panel's "Library" button (appends to that panel).
  - `src/components/PanelItem.tsx` — per-panel hover controls: "Replace", "Add photo (N/8)" (from computer), and "Library" (from the saved image library). Both add paths append to the same panel up to MAX_PANEL_IMAGES; they use plain buttons (not a dropdown) because native file dialogs don't reliably open from inside a Radix menu portal.
  - `src/lib/ai-client.ts` — Text→Novel conversion logic (script + image generation, style consistency) plus `editImage()` (image-to-image; downscales client-side, posts raw PNG). Talks only to our own `/api/ai/*`; no provider/keys client-side.
  - `src/components/EditImageDialog.tsx` — "Edit Photo" feature: upload an image, describe the change in plain words, strength slider, then add result as a panel / download / re-edit.
  - `src/lib/style-presets.ts` — drawing-style presets (incl. token-light `stick`).
  - `src/lib/export.ts` — PDF + video export. Video uses deterministic WebCodecs (`renderVideoBlob`) + `webm-muxer`, with offline audio mixing; `MediaRecorder` only as a fallback for browsers without `VideoEncoder`.
  - `src/lib/diagnostics.ts` + `src/components/DiagnosticsDialog.tsx` — "Self-Test" button: synthetically builds novels, exports video, and decodes the result to verify duration + that every panel is present (no freeze).
  - `src/components/ConvertDialog.tsx` — the Text→Novel form (incl. PDF/.docx/TXT upload into source text).
  - `src/lib/text-extract.ts` — client-side document text extraction (pdfjs-dist + mammoth, lazy-loaded).
  - `src/components/SpeakControl.tsx` — per-panel ElevenLabs character voice picker.
  - `src/lib/tts-client.ts` — calls the speech endpoints.
- `artifacts/api-server/src/routes/auth.ts` + `src/lib/passport.ts` — custom Google OAuth (passport-google-oauth20). Routes: `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout`. Sessions via `express-session` + `connect-pg-simple` (Postgres `user_sessions` table). `src/middlewares/requireAuth.ts` gates all `/api/ai/*`.
- `artifacts/graphic-novel/src/hooks/use-auth.ts` — client auth: react-query hook on `/api/auth/me`, `signInWithGoogle()` full-page nav to `/api/auth/google`. `App.tsx`'s `AuthDataGuard` wipes IndexedDB + localStorage when the signed-in account changes or on sign-out (keyed on `gnc:last-user-id`).
- `artifacts/api-server/src/routes/ai.ts` — auth-gated AI routes, all using backend env keys: `/api/ai/script` (Anthropic + Venice fallback), `/api/ai/image` (Dezgo Flux text2image, returns PNG bytes), `/api/ai/edit` (Dezgo `image2image` img2img — raw image body via `express.raw`, prompt/strength as query params, returns PNG), `/api/ai/voices` + `/api/ai/tts` (ElevenLabs), and `/api/ai/config` (reports readiness only).

## Architecture decisions

- **Custom Google OAuth, not Clerk.** Auth is our own passport-google-oauth20 flow with server-side sessions (`express-session` + `connect-pg-simple`), keyed by the Google profile id in the `users` table. Cookies are `httpOnly` + `sameSite=lax` (+ `secure` in prod, behind `trust proxy`). OAuth `state` is enabled for CSRF protection. The app and API are same-origin through the shared proxy, so the browser sends the session cookie automatically.
- **Backend-only AI keys.** Users never see, enter, or supply any key — there is no provider UI. All keys are env secrets used server-side: script via Anthropic (`claude-sonnet-4-6`, Venice `llama-3.3-70b` fallback), images via Dezgo Flux (`flux_1_schnell`), speech via ElevenLabs. The browser only calls our auth-gated `/api/ai/*`; hosts are fixed (no SSRF surface).
- **Style consistency is enforced, not requested.** A fixed style prefix + a single shared seed are applied to every panel's image call, and the LLM is forbidden from emitting style words. See `.agents/memory/graphic-novel.md`.
- **Everything client-side.** All novel data lives in the browser's IndexedDB; there is no server database for user content.
- **Per-panel audio layers over sequence audio** in both live preview and video export.

## Product

Graphic Novel Creator is a browser studio with two ways to build a novel:
1. **Manual** — upload your own panel images, write captions, add sequence-wide audio, arrange, and play back as a slideshow; export to PDF or video.
2. **Text → Graphic Novel (AI)** — paste source text, describe the desired output, pick a drawing style (presets including a cheap token-light stick-figure mode), set panel count and per-panel duration, optionally add audio, and CONVERT into a fully generated novel with a consistent art style across all panels.

Per panel, users can attach an optional dedicated audio track that plays over the sequence soundtrack.

A `/library` page provides three persistent, cross-project libraries — Images, Documents, and Instructions (reusable "turn it into…" prompts) — so users upload or write once and reuse everywhere: library images can be added as panels from the Studio "Add Panels" menu, and saved documents/instructions can be loaded into (or saved from) the Text → Graphic Novel dialog.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
