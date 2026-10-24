# ADR-0005 — One Expo codebase for web + native

Date: 2026-10-24 · Status: Accepted

## Context

The product is mobile-first (a training calendar you check at 6am) but must
be shareable as a web app on the existing Cloudflare Pages + domain
infrastructure, with native iOS/Android builds planned (testable on this
machine's emulators).

## Decision

- **`apps/expo` is the only UI codebase**: Expo SDK 57, expo-router,
  react-native-web. Web ships as a *static export* (`expo export --platform
  web`, `web.output: "static"`) deployed to Cloudflare Pages with a
  `_redirects` SPA fallback. Native iOS/Android via EAS/Expo builds later —
  no code fork.
- Runtime config through `EXPO_PUBLIC_*` env vars only (PB_URL, WORKER_URL).
- PocketBase SDK auth store adapts per platform (AsyncStorage on native,
  localStorage on web).
- SSE streaming via fetch + ReadableStream (EventSource can't send auth
  headers).

## Consequences

- Native constraints shape the web build (no DOM-only APIs) — kept honest by
  building once for both.
- Deep links on web need the redirect rule; on native, expo-router handles
  schemes.
- Emulator build/QA is deferred to the vision-capable session (issue V-11) —
  structure exists now, verification needs eyes.
