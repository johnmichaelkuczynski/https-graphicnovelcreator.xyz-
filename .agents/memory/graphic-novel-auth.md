---
name: Graphic Novel auth
description: How auth works in Graphic Novel Creator after the Clerk→Google OAuth swap, and the one setup step a human must do.
---

# Auth: custom Google OAuth (Clerk was removed)

Development access must not require Google; production authentication and admin restrictions must remain intact.
**Why:** The user explicitly requested frictionless development access, not removal of public-app login protection.
**How to apply:** Preserve this separation when changing authentication; verify the real development hostname, since localhost screenshot requests do not qualify for development access.

Auth is the app's OWN Google OAuth, not Clerk. The implementation is a **user-supplied canonical `auth.ts`** (in `artifacts/api-server/src/auth.ts`) that must be kept verbatim except app-specific domain values — do not "clean it up" (it uses `console.*`, `as any`, and a hardcoded dev SESSION_SECRET fallback on purpose). Stack: `passport` + `passport-google-oauth20`, server-side sessions via `express-session` backed by `connect-pg-simple`. `setupAuth(app)` (called from `app.ts`) wires trust-proxy + session + passport + the `/api/auth/*` and `/api/admin/*` routes. Users persist in the `users` table with a **numeric serial `id`** plus `username`/`googleId`/`email`/`displayName`; a `storage.ts` (Drizzle) layer backs all the lookups/upserts auth.ts calls. A `visits` table records one row per successful sign-in for the owner-only `/api/admin/visits` analytics (admin = `johnmichaelkuczynski@gmail.com`). All `/api/ai/*` are gated by `isAuthenticated` exported from `auth.ts`.

**Session table must be in the Drizzle schema, NOT left to `createTableIfMissing`.** `connect-pg-simple`'s `createTableIfMissing: true` tries to read its bundled `table.sql`, which does not exist after esbuild bundles the server (`ENOENT dist/table.sql`), so on a fresh DB it silently fails to create `user_sessions` and login won't persist. Fix: `user_sessions` is declared in `lib/db/src/schema/sessions.ts` (columns `sid`/`sess`/`expire` + `IDX_user_sessions_expire`) so `db push` provisions it everywhere; auth.ts's `createTableIfMissing` then becomes a harmless no-op. Never remove that schema table.

**Callback path is `/api/auth/google/callback` (must live under `/api`).** The shared reverse proxy only routes `/api` to the API server, so the OAuth callback cannot be at a bare `/auth/...` path. `CALLBACK_PATH` in auth.ts is set accordingly.

**Human-only setup step (cannot be automated):** the Google OAuth **redirect URI must be registered in the user's Google Cloud Console** OAuth client, or login fails with `redirect_uri_mismatch`. The URI is `https://<domain>/api/auth/google/callback`. The server derives `<domain>` from `REPLIT_DEV_DOMAIN` in dev and the first `REPLIT_DOMAINS` entry in prod — so the **deployed `.replit.app` domain is different from the dev domain and must be added separately** after deploying.

**Why:** Clerk was painful here because its keys were never actually set; the user supplied their own `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` and wanted full ownership.

**How to apply / gotchas:**
- App (served at `/`) and API (`/api`) are same-origin via the shared proxy, so the session cookie flows automatically; client fetches just use `credentials: "include"`. Do not add cross-origin/base-URL hacks.
- **Full sign-in gate:** signed-out users must see NOTHING but the login gate. `AppRoutes` returns `<Landing />` for every path when not signed in — no route (Studio/Library/Admin/NotFound) is reachable unauthenticated. Keep this whenever adding routes.
- **Admin-only Administrative page** (`/admin`, page `Administrative.tsx`): Google-login analytics (day/week/month/year/all-time stat cards + recharts bar charts) + a who-logged-in table, fed by `/api/admin/visits`. Server `isAdmin` (exact admin-email match) is the real gate (403 otherwise); the client `isAdmin` from `useAuth` (compares email to the same admin address, duplicated on purpose as UI-only) just shows/hides the `/admin` route and the Studio menu link.
- Local-first data isolation: novels live only in the browser's IndexedDB. `AuthDataGuard` (in `App.tsx`) wipes IndexedDB + localStorage when the signed-in account id changes or on sign-out, tracked via localStorage key `gnc:last-user-id`. Preserve this whenever touching auth or the login flow, or one account can see another's local content.
- OAuth `state: true` is set on the GoogleStrategy (CSRF protection) and relies on the session middleware being mounted before passport.
