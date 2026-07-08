---
name: Graphic Novel auth
description: How auth works in Graphic Novel Creator after the Clerk→Google OAuth swap, and the one setup step a human must do.
---

# Auth: custom Google OAuth (Clerk was removed)

Auth is the app's OWN Google OAuth, not Clerk. Stack: `passport` + `passport-google-oauth20`, server-side sessions via `express-session` backed by `connect-pg-simple` (Postgres, auto-created `user_sessions` table). Users persist in the `users` table keyed by the Google profile id (the OAuth subject); login upserts. All `/api/ai/*` are gated by a `requireAuth` middleware (session-based), replacing the old `getAuth(req).userId` checks.

**Human-only setup step (cannot be automated):** the Google OAuth **redirect URI must be registered in the user's Google Cloud Console** OAuth client, or login fails with `redirect_uri_mismatch`. The URI is `https://<domain>/api/auth/google/callback`. The server derives `<domain>` from `REPLIT_DEV_DOMAIN` in dev and the first `REPLIT_DOMAINS` entry in prod — so the **deployed `.replit.app` domain is different from the dev domain and must be added separately** after deploying.

**Why:** Clerk was painful here because its keys were never actually set; the user supplied their own `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `SESSION_SECRET` and wanted full ownership.

**How to apply / gotchas:**
- App (served at `/`) and API (`/api`) are same-origin via the shared proxy, so the session cookie flows automatically; client fetches just use `credentials: "include"`. Do not add cross-origin/base-URL hacks.
- Local-first data isolation: novels live only in the browser's IndexedDB. `AuthDataGuard` (in `App.tsx`) wipes IndexedDB + localStorage when the signed-in account id changes or on sign-out, tracked via localStorage key `gnc:last-user-id`. Preserve this whenever touching auth or the login flow, or one account can see another's local content.
- OAuth `state: true` is set on the GoogleStrategy (CSRF protection) and relies on the session middleware being mounted before passport.
