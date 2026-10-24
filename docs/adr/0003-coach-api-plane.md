# ADR-0003 — Coach API plane: Cloudflare Worker (+ Pages-Function fallback), BYO keys server-side

Date: 2026-10-24 · Status: Accepted

## Context

The coach needs server-side code (stream OpenRouter, hold intervals.icu and
OpenRouter keys, validate PocketBase tokens, run sync crons). The existing
webapp-family CF token is Pages-scoped; a Workers-scoped token was added
mid-setup. PocketHost cron is unreliable (hibernation drops intervals).

## Decision

- The coach API is `apps/worker` — a dependency-free Cloudflare Worker
  (fetch + scheduled). **Canonical deployment: the standalone Worker**
  `intervals-coach.imnick.workers.dev` with a **native cron** (`0 */6 * * *`).
- **Fallback that must keep working:** the same entry bundles via esbuild
  into a Pages advanced-mode `_worker.js` (`tools/build_functions.mjs`)
  deployed with the web project — same code, no Workers permission needed.
  `GET /api/cron` (X-Cron-Secret) exists as the manual/ci-driven trigger.
- **Keys are BYO and server-side only.** The user's intervals.icu + OpenRouter
  keys live in *hidden* fields on their PocketBase users record; the Worker
  reads them as superuser; nothing ever ships to the client. The client's
  only credential is its PocketBase token, validated per-request via
  `POST /api/collections/users/auth-refresh`.
- The Worker's PocketBase superuser credentials are Worker secrets
  (PB_URL/PB_EMAIL/PB_PASSWORD), set once via `wrangler secret put`; deploys
  don't rotate them.

## Consequences

- Two deploy paths exist by design; CI deploys the Worker (canonical) and the
  web static export. The bundler tool is the escape hatch.
- Adding endpoints = editing `apps/worker/src/index.ts` routes; tests cover
  the pure pieces (digests) and core validators cover the payloads.
- Cross-origin from the app is explicit (`ALLOWED_ORIGINS`); native apps have
  no Origin and pass.
