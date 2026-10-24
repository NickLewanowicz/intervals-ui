# intervals — Architecture

Reading order: `docs/SPEC.md` (product) → this file → `docs/adr/`.

## 1. System overview

Three planes. The Worker is the only thing that talks to intervals.icu for
writes and to OpenRouter at all; the client only ever holds a PocketBase
token.

```
                    ┌──────────────────────────────────────────┐
  Browser / native  │ Expo app (react-native-web + native)     │
  intervals.imnick.dev                                          │
                    │  PB token in authStore (AsyncStorage)    │
                    └──────┬───────────────────────┬───────────┘
              reads (REST) │                       │ chat / proposals / sync
                           ▼                       ▼
              ┌─────────────────────┐   ┌────────────────────────────┐
              │ Data plane          │   │ Coach API (CF Worker)      │
              │ intervals.pockethost│◀──│ intervals-coach            │
              │ users · mirrors ·   │tok│ • validates PB tokens      │
              │ chat · proposals    │n  │ • builds context digests   │
              └─────────┬───────────┘   │ • OpenRouter (BYO key)     │
                        │ superuser     │ • tool-calls → proposals   │
                        └──────────────▶│ • apply (user-approved)    │
                                       └───────┬────────────────────┘
                                               │ read + approved writes only
                                               ▼
                                    intervals.icu /api/v1 (canonical)
```

- **App plane** — Expo Router app; one codebase for web (static export →
  Cloudflare Pages) and native. All reads hit the PocketBase mirrors; all
  coach interaction hits the Worker over SSE.
- **Data plane** — PocketBase on pockethost. `users` (auth) + mirrors
  (`calendar_events`, `activities`, `wellness`, `sport_settings`) + workflow
  (`chat_sessions`, `chat_messages`, `proposals`, `sync_state`). Owner-only
  read rules; all writes to locked collections happen as superuser from the
  Worker (secret API-key fields are `hidden` — invisible even to their owner
  via the API; the Worker reads them as superuser).
- **Coach plane** — Cloudflare Worker. Native cron (`0 */6 * * *`) syncs every
  connected user. The same code ships as a Pages-Function fallback
  (`tools/build_functions.mjs` → `_worker.js`) — see ADR-0003 for why both.

## 2. Holder doctrine (what lives where, what's rebuildable)

| Truth | Holder | Rebuild PocketBase from |
|---|---|---|
| Calendar & activities | intervals.icu (canonical) | `POST /api/sync` or `node tools/pb_sync.mjs` (minutes) |
| Identity | Google OAuth (dev: email+password until consent screen) | re-login recreates |
| API keys (intervals.icu, OpenRouter) | PocketBase `users` row (hidden fields) | re-enter in Settings |
| Chat history + proposals | PocketBase | lost on wipe (acceptable; proposals pending > applied are short-lived) |
| Schema | `tools/pb_setup.mjs` (schema of record) | re-run against a fresh instance |
| Coach prompts | git (`packages/core/src/prompts/coach.ts`) | — |

## 3. The sync contract

One-way: intervals.icu → PocketBase mirrors. Windows: events −21d → +90d,
activities −90d, wellness −30d, sport settings always. Upserts key on
(user, intervals_id) / (user, date); rows are skipped when a key-order-stable
fingerprint of the upstream object is unchanged — steady-state syncs write
~0 rows (the Workers subrequest budget depends on this). pockethost
rate-limits `/api` (429) and disables the PB batch API: sequential writes,
retry-with-backoff, ~400ms pacing in the seed tool.

Triggers: Worker cron every 6h (all users) · `POST /api/sync` (user, manual
button) · after every applied proposal (immediate mirror refresh).

## 4. The write contract (steered proposals)

```
user msg ─▶ Worker /api/chat ─▶ OpenRouter (tools: propose/update/delete_event)
                    │                        │
                    │ validate (proposal.ts) │ tool_calls
                    ▼                        ▼
             chat_messages (persist)   proposals row (status=pending)
                                             │ SSE `proposal` event
                                             ▼
                                    ProposalModal (steer: edit intent via
                                    follow-up chat, approve, or dismiss)
                                             │ approve
                                             ▼
                    POST /api/proposals/:id/apply
                                             │ user's own intervals.icu key
                                             ▼
                    intervals.icu POST/PUT/DELETE /athlete/{id}/events
                     (create uses uid=coachUid(...) + upsertOnUid=true
                      → AI re-planning is idempotent, never duplicates)
                                             │
                                             ▼
                    mirror re-sync → calendar updates everywhere
```

Invariants:
1. The client cannot reach intervals.icu or OpenRouter — no key ever ships to
   the browser/app beyond the user's own PB token.
2. Every proposal payload passes `validateEventEx` before storage; apply
   re-uses the stored payload untouched.
3. Deletes and updates reference intervals.icu ids from the digest the coach
   saw (#id in `calendarDigest`) — the model never invents ids (validated:
   update/delete require `id`).

## 5. Model policy

Default `z-ai/glm-5.3-flash` (reasoning pinned `low`); roster + rationale in
`packages/core/src/prompts/coach.ts` and `docs/research/openrouter-models-brief.md`.
Every request sets `provider.require_parameters = true` so tool calls never
route to endpoints lacking them. Users pick their model in Settings
(`preferred_model`); BYO OpenRouter key. Changes to the default require eval
numbers (`tools/eval_prompts.mjs`, log in `docs/research/eval-log.md`).

## 6. Deploy topology

| Thing | Where | How |
|---|---|---|
| Web | `intervals.imnick.dev` → `intervals-356.pages.dev` (CNAME, unproxied) | Gitea Actions on push to main: `expo export --platform web` → `wrangler pages deploy` |
| Coach API | `intervals-coach.imnick.workers.dev` (+ secret env: PB_URL/PB_EMAIL/PB_PASSWORD/CRON_SECRET) | same CI: `wrangler deploy` (secrets persist across deploys) |
| Sync cron | Worker trigger `0 */6 * * *` | native; `GET /api/cron` (X-Cron-Secret) is the manual fallback |
| PocketBase | pockethost instance `intervals` | SFTP `ftp.pockethost.io:2222` key `~/.ssh/pockethost_ed25519`, dir `intervals/` |
| Repo/CI | Gitea `nick/intervals` (runner on tower) | `.gitea/workflows/ci.yml` |

Pages-Function fallback (`_worker.js`, advanced mode) exists because the
original CF token was Pages-only; the Workers-scoped token now deploys the
standalone Worker. Keep the bundler working — it's the escape hatch if Worker
deploys regress.

## 7. Failure modes

| Failure | Behavior | Why it's safe |
|---|---|---|
| intervals.icu down / rate-limited | sync errors land in `sync_state.error`; app serves last mirror; coach answers from stale digest with its date visible in the prompt | mirror + retry/backoff |
| pockethost hibernation (1–3s cold start) | first request slow; worker retries 429s with backoff | acceptable for a training app |
| PocketBase wiped | mirrors rebuild via sync; keys/profile re-entered | holder doctrine §2 |
| OpenRouter key invalid/limit | chat returns `missing_openrouter_key` / 502 with detail; calendar unaffected | chat is additive, not load-bearing |
| Model emits garbage tool args | validation error recorded as `proposal_errors` on the `done` event + skipped (never stored, never applied) | validators + steered writes |
| Worker subrequest cap (50) | first-ever sync per user may exceed it — seed via `tools/pb_sync.mjs` (no cap); steady state ≪ cap | fingerprint skipping |
| Applied proposal conflicts (event changed upstream) | intervals.icu 4xx → proposal marked `failed` with error; user sees it in the modal/chat | status machine |

## 8. ADR index

See `docs/adr/`. 0001 PocketBase mirror doctrine · 0002 events-not-activities
write model · 0003 coach API plane (Worker + Pages fallback) · 0004 model
selection · 0005 Expo web+native monorepo.
