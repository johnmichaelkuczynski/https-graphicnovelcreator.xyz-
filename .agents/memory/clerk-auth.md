---
name: Clerk auth + local data scoping
description: How auth is wired in graphic-novel and why local IndexedDB data must be wiped on user change.
---

# Auth setup
Replit-managed Clerk. Web client (`graphic-novel`) uses the canonical `<ClerkProvider>` wiring (publishableKeyFromHost + proxyUrl from env, wouter base path, `/sign-in/*?` + `/sign-up/*?` routes). The `api-server` mounts the Clerk proxy middleware + `clerkMiddleware`. Google SSO is enabled by default on the Replit-managed dev instance — no extra config needed for "Continue with Google" to appear.

**Rule:** never modify the copied `clerkProxyMiddleware.ts` template or add PROD/NODE_ENV gates to the Clerk wiring — it's canonical Replit code meant to run identically in dev (empty env) and prod (auto-populated). A code reviewer may flag the proxy's `x-forwarded-*` handling as a security risk; leave it — trust-proxy is handled at the Replit platform layer.

# Cross-user local data wipe
This app stores ALL content (projects/panels/audio) in browser IndexedDB + a global `localStorage` selection key — none of it is scoped to a Clerk user.
**Why:** on a shared browser, signing out User A and into User B would otherwise show B all of A's local projects. Auth-gating the UI does not partition persisted local content.
**How to apply:** the Clerk session listener (`addListener`) compares the previous user id to the new one and, when it actually changes (not on first load), wipes IndexedDB (`dbApi.clearAllData()`) + removes the localStorage project key + clears the React Query cache. If you ever add per-user persistence instead, scope projects by `ownerUserId` and the storage key by user id (DB version bump required).
