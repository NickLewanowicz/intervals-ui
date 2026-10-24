# intervals 🏃

A simplified view of your [intervals.icu](https://intervals.icu) training —
calendar, stats — with an AI coach grounded in **80/20 training principles**
(Matt Fitzgerald's *80/20 Running* + *Run Like a Pro*, distilled) that plans
your running… and **you approve every change** before it touches your real
calendar.

- **App:** https://intervals.imnick.dev (Cloudflare Pages — Expo web export; native iOS/Android from the same codebase, in progress)
- **Coach API:** https://intervals-coach.imnick.workers.dev (Cloudflare Worker: chat SSE, steered proposal writes, 6-hourly data sync cron)
- **Data:** PocketBase https://intervals.pockethost.io (rebuildable mirror of intervals.icu + app state; BYO keys stored hidden)
- **Repo:** https://git.imnick.dev/nick/intervals (private; CI deploys on green)

## Quickstart

```bash
pnpm install
pnpm test            # core + worker + app tests
pnpm typecheck
pnpm dev:web         # Expo web dev server (http://localhost:8081)
pnpm worker:dev      # coach API locally (wrangler dev, needs apps/worker/.dev.vars)
```

PocketBase provisioning / sync / dev login:

```bash
node tools/pb_setup.mjs       # idempotent schema apply
node tools/pb_sync.mjs        # pull intervals.icu → mirrors (seed / manual)
node tools/pb_dev_user.mjs    # dev sign-in creds → .scratch/dev-user.txt
```

Prompt/model evals (never touch intervals.icu):

```bash
node tools/eval_prompts.mjs [--model <id>]     # scores fixtures, appends docs/research/eval-log.md
```

## How it works

```
you ──chat──▶ coach API ──tools──▶ proposals ──you approve──▶ intervals.icu
                    │                                    │
                    └── 6-hourly cron ─▶ PocketBase ◀─────┘ (mirror re-sync)
app (Expo web/native) ──reads──▶ PocketBase mirrors ──renders──▶ calendar + stats
```

## Docs

- `docs/SPEC.md` — the product, surface by surface
- `docs/ARCHITECTURE.md` — planes, holders, sync + write contracts, deploy topology
- `docs/AUTH.md` — Google OAuth setup (pending consent screen; dev login meanwhile)
- `docs/adr/` — decisions (mirror doctrine, events-not-activities, coach API, models, Expo)
- `docs/research/` — intervals.icu API brief, OpenRouter model brief, training-knowledge summary, eval log
- `docs/ISSUES-VISION.md` — the vision-session issue list (look-and-feel + QA)
- `AGENTS.md` — working agreement for the AI team; `.zcode/agents/` — personas

## Safety

Every calendar mutation is a proposal you approve in a modal — the AI cannot
write to intervals.icu on its own. Training guidance is educational
(distilled from the books above + your data), not medical advice: pain,
injury, or health red flags mean a professional, not a plan tweak.
