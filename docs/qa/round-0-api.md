# QA Round 0 — Coach API + data plane (non-vision session, 2026-10-24)

All checks run from the orchestrator session against production endpoints.
**No writes were made to intervals.icu** — every intervals.icu call here is a
read; the one proposal created during testing was **dismissed** and verified
absent from the real calendar.

## PocketBase provisioning

- `node tools/pb_setup.mjs` — schema applied idempotently: users extended
  (hidden key fields), 8 collections created (mirrors, chat, proposals,
  sync_state) with owner-read rules.
- `node tools/pb_dev_user.mjs` — dev user created, auth smoke OK.
- `node tools/pb_sync.mjs` — real data seeded: events=21, activities=57,
  wellness=31, zones=true.

## Coach API (https://intervals-coach.imnick.workers.dev)

| Check | Result |
|---|---|
| GET /api/health | `{"ok":true}` |
| POST /api/sync (Bearer user token) | `{"ok":true,"events":0,"activities":0,"wellness":0,"sportSettings":true}` — steady state (fingerprint skipping works; first seed had written 100+) |
| POST /api/chat "What does my week look like?" | SSE stream rendered deltas; answer cited real calendar entries (Sun 10-25 recovery jog, run-club session) — grounded in mirror data ✓ |
| POST /api/chat "add a 40-min Z2 shakeout Nov 2 7am" | `event: proposal` with validated payload (create_event, WORKOUT, 2026-11-02T07:00, distance 6500m, moving_time 2400s, intervals-syntax description, rationale) ✓ |
| POST /api/proposals/:id/dismiss | `{"ok":true,...}` → pending list empty ✓ |
| Real calendar check (GET events 2026-11-02) | `[]` — **production calendar untouched** ✓ |
| Cron | Native trigger `0 */6 * * *` deployed; `GET /api/cron` (X-Cron-Secret) fallback available |

## Prompt/model baseline (tools/eval_prompts.mjs — zero intervals.icu calls)

- `z-ai/glm-5.3-flash` (default): 3/3 fixtures PASS — 5,175 in / 589 out tokens
- `anthropic/claude-haiku-5.5`: 3/3 PASS — 8,223 in / 2,354 out
- Fixtures: weekly feedback (noWrite + must-mention), schedule shakeout
  (create WORKOUT on exact date), race registration (create RACE_A on exact
  date). Log: docs/research/eval-log.md

## Deploy topology verified live

- Web placeholder: https://intervals.imnick.dev (CNAME → intervals-356.pages.dev, cert OK)
- API fallback: `/_worker.js` Pages Function also verified healthy on the same domain
- Worker secrets set: PB_URL, PB_EMAIL, PB_PASSWORD, CRON_SECRET

## Known gaps at round 0

- Expo app completion + visual QA → round 1 (vision-capable session/agents)
- Google OAuth pending Nick's consent screen (docs/AUTH.md Part A)
- `docs/research/training-knowledge-summary.md` + `knowledge.ts` pending
  distiller agent (80/20 + Run Like a Pro extracted to .scratch/books/)
