# intervals — Working Agreement

An AI-coached view of intervals.icu: calendar + stats + a coach that proposes
(you approve) every calendar change. Deployed: web https://intervals.imnick.dev
(Cloudflare Pages), coach API https://intervals-coach.imnick.workers.dev,
data https://intervals.pockethost.io, code https://git.imnick.dev/nick/intervals.

## Non-negotiables

1. **Steered writes only.** The AI never writes to intervals.icu directly —
   every mutation is a validated *proposal* the user approves in the modal.
   The apply path lives only in the Worker (`/api/proposals/:id/apply`).
2. **The production calendar is sacred in testing.** Never POST/PUT/DELETE to
   intervals.icu against the real athlete (`i167187`) from tests, evals, or
   scripts. Evals validate payloads in memory (`tools/eval_prompts.mjs`
   makes zero intervals.icu calls). Read-only GETs are fine.
3. **The events-not-activities trap.** Scheduling a run = `POST
   /athlete/{id}/events` with `EventEx`. `/workouts` is a template library we
   don't touch. Races = `category: RACE_A|B|C`. (ADR-0002.)
4. **BYO keys stay server-side.** OpenRouter + intervals.icu keys live in
   hidden PocketBase fields, read only by the Worker as superuser. Never log
   them, never ship them to the client.
5. **Schema changes are scripted.** `tools/pb_setup.mjs` is the schema of
   record; edit + re-run (idempotent). No hand-editing PocketBase rows as a
   substitute for a migration.
6. **Tests gate every commit.** `pnpm test` + `pnpm typecheck` locally; CI
   runs the same and deploys on green (main). Prompt changes must keep
   `packages/core/tests/prompts.test.ts` and the eval fixtures honest.
7. **Coaching content is grounded.** Training guidance comes from the
   distilled knowledge base (`packages/core/src/prompts/knowledge.ts`,
   80/20 Running + Run Like a Pro — see `docs/research/training-knowledge-summary.md`)
   and the athlete's real data. The coach states the 80/20 basis openly and
   never gives medical/injury advice (red flags → professional).

## Repo layout

```
apps/expo/            # the app: Expo Router, web (static export) + native
apps/worker/          # coach API: CF Worker (chat SSE, proposals, sync, cron)
packages/core/        # shared domain: intervals client, stats, proposal
                      # validators, coach prompt + model roster + knowledge base
docs/                 # SPEC, ARCHITECTURE, AUTH, ADRs, research, issues
tools/                # pb_setup / pb_sync / pb_dev_user / build_functions /
                      # eval_prompts (prompt+model eval harness)
.zcode/agents/        # personas: ui-builder, coach-tuner, visual-reviewer
.scratch/             # gitignored working area (evals fixtures, books, dev-user.txt)
```

## How we work (AI-driven team)

The **Maintainer** (orchestrator) owns scope, sequencing, acceptance, and all
infrastructure changes. Work flows through `docs/ISSUES-VISION.md` (mirrored
as Gitea issues):

- **ui-builder** implements app issues (screens, flows, tests).
- **coach-tuner** iterates prompts/models with the eval harness; never ships a
  prompt or default-model change without eval numbers in
  `docs/research/eval-log.md`.
- **visual-reviewer** (vision-capable session) walks the live app, judges
  look-and-feel, files FIXes with screenshot evidence. Non-vision sessions
  verify via accessibility snapshots / DOM text only — they do not judge
  visuals.

Sequencing rule: functional correctness issues (F-*) before visual polish
(V-*) before nice-to-have (N-*).

## Environment

- **Deploy:** push `main` → Gitea Actions → tests → Worker deploy (`wrangler`,
  CLOUDFLARE_WORKERS_TOKEN) + web deploy (`expo export:web` → Pages,
  CLOUDFLARE_API_TOKEN). Secrets already on the repo.
- **PocketBase:** instance `intervals` on pockethost; superuser credentials in
  the root `.env` (gitignored); provisioning `node tools/pb_setup.mjs`;
  seeding/sync `node tools/pb_sync.mjs`; dev login `node tools/pb_dev_user.mjs`
  (credentials land in `.scratch/dev-user.txt`).
- **intervals.icu:** auth is Basic with username literally `API_KEY`;
  athlete id `0` = self; rate limits 5k/day + 2.5k/15min; browser-like UA
  required (Cloudflare fronting).
- **Local:** node ≥ 20, pnpm ≥ 10. `pnpm dev:web` / `pnpm worker:dev`
  (wrangler dev with `.dev.vars`), `pnpm test`, `pnpm typecheck`.

## Definition of done (a change)

Tests + typecheck green · mirrors/schemas still in sync with code ·
`.env`-dependent tooling still documented · CI green on main (deploy included)
· visual-affecting changes carry a `qa-screenshots/` artifact for the reviewer.
