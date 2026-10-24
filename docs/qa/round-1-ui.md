# QA Round 1 — Expo app UI (non-vision session, 2026-10-24)

Headless verification only (no browser tooling in this session): dev-server
route checks + a Node data-layer smoke that imports the app's own pure modules
(`src/lib/filters.ts`, `src/lib/sse.ts`) and replays the exact requests the
screens make. Scripts: `.scratch/smoke-app.mjs`, `.scratch/smoke-coach.mjs`
(gitignored). Visual pass (V-01..V-07) still pending for a vision-capable
reviewer. **No proposal was created or applied; the real calendar is
untouched.**

## Fixes this round

- `apps/expo/.env.local`: `EXPO_PUBLIC_WORKER_URL` pointed at
  `http://localhost:8787` → now `https://intervals-coach.imnick.workers.dev`
  (app works against production infra immediately).
- Splash (`app/(marketing)/index.tsx`): CTAs were dead — `<Link asChild>`
  wrapped a component that never forwarded `onPress`. Now navigate via
  `router.push`. Added the required footer disclaimer and the placeholder
  "Built on 80/20 training principles" section (V-01 does the full story).
- Extracted PB filter strings to pure `src/lib/filters.ts` (+4 tests) so the
  headless smoke exercises the exact query builders the screens run.

## Gates

| Gate | Result |
|---|---|
| `pnpm install` (root) | clean |
| `npx tsc --noEmit` (apps/expo) | 0 errors |
| `npx vitest run` | 4 files, 31/31 pass |
| `npx expo export --platform web` | all routes + `dist/_redirects` (`/* /index.html 200`) |
| Dev server routes (:8081) | `/`, `/sign-in`, `/calendar`, `/calendar/day`, `/coach`, `/settings` → all 200; Metro bundle 200 (925 modules), log error-free |
| Static HTML copy check | index.html: headline, CTA, how-it-works, 80/20 title, disclaimer ✓ · sign-in.html: "Google — coming soon" ✓ |

## Data-plane smoke (11/11)

PB `authWithPassword` (dev user) ✓ · `calendarWindowFilter` output shape ✓ ·
`calendar_events` for 2026-10-13..11-08: **10 events**, all ISO-local, all in
window, real names/distances (e.g. "Run club — 10×(1' hard / 1' easy)…",
2026-10-20T17:45) ✓ · `activities`: **5 activities** with parseable
distance/pairing ✓ · worker `/api/health` ✓ · `GET /api/proposals?status=pending`
with user token: 0 pending ✓

## Coach-plane smoke (4/4)

`POST /api/chat` "What does my week look like?" streamed through the app's own
`lib/sse.ts` parser: 346 `delta` frames, 1,089-char grounded answer citing the
real week ("Sat 10-24 (today): Aerobic maintenance 9km/49m planned — already
done, 8.4km/47m, load 70"), `done` carried `session_id` (rolling session) ✓ ·
`POST /api/sync`: `ok:true`, steady state 0 rows written (fingerprint
skipping) ✓

## Known gaps (handed to vision pass / later issues)

- Splash, tabs, calendar, modal are grayscale structure — V-01..V-07 pending.
- Visual/browser interaction (focus states, scroll behavior, iOS Safari) not
  verified headlessly; no screenshots from this round by design.
- Native (iOS/Android) untested — web is the verified surface.
