# intervals 🏃

A simplified view of your [intervals.icu](https://intervals.icu) training —
calendar, stats — with an AI coach grounded in **80/20 training principles**
and public endurance-science research that plans your running… and **you
approve every change** before it touches your real calendar.

**Live app:** [intervals.imnick.dev](https://intervals.imnick.dev) ·
native iOS/Android from the same codebase (Android beta ready; iOS in progress)

Deployment runs on Cloudflare Pages + Workers with a PocketBase data layer —
see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full topology and
[`.env.example`](.env.example) for configuration.

## Features

- **Sign-in** — Google OAuth (primary) + email/password fallback
- **Calendar** — week view (day pills, run cards, DONE/PLANNED reconciliation, race badges) and month view with a selected-day panel; deep-linkable day detail with workout text, actuals and zone bars
- **Hero stats** — weekly/monthly distance, time, load, form, with a tappable "Your training, right now" drill-down (coach bubble, load gap, zone mix, fitness CTL/ATL, 7-day recovery HRV/RHR/sleep)
- **AI coach** — grounded, streaming chat (markdown, stop/retry, sessions with pin/rename/delete, suggested replies), hybrid server/on-device transport, model picker
- **Proposals** — every calendar write is an approve-or-dismiss modal with field-level diffs; multi-change **bundles** with per-row checkboxes and batch apply
- **Settings** — BYO keys (write-only), model picker, OpenAI-compatible base URL, theme (system/light/dark), units, athlete profile
- **Android home-screen widgets** — Fitness, Upcoming runs, Next Race countdown (native receivers generated at prebuild by the react-native-android-widget plugin; iOS WidgetKit code present, distribution deferred)

Full walkthrough with screenshots: **`docs/FEATURES.md`**.

## Screenshots

Every feature in this README is documented with embedded captures in
[`docs/FEATURES.md`](docs/FEATURES.md); the curated images live in
[`docs/screenshots/`](docs/screenshots/README.md). The raw QA capture library
(200+ shots across personas and surfaces) is regenerated any time via `tools/shot_registry.mjs` + `tools/parity_shots.sh` (the `qa-screenshots/` folder itself is gitignored — it's a local observation surface).

## Built with AI assistance

This project is built by the maintainer with heavy LLM/agent assistance:
planning, implementation, QA walkthroughs (the persona swarm behind
`docs/qa/` and `qa-screenshots/`), prompt/model evals, and this documentation
were all produced iteratively with coding agents — the commit history
reflects that agent-assisted development. Training guidance is synthesized from
published sources (see `docs/research/training-knowledge-summary.md`);
product decisions are the maintainer's.

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

- `docs/FEATURES.md` — the user-facing feature guide, with screenshots
- `docs/SPEC.md` — the product, surface by surface
- `docs/ARCHITECTURE.md` — planes, holders, sync + write contracts, deploy topology
- `docs/AUTH.md` — Google OAuth (LIVE since Nov 2026) + PocketBase provider setup
- `docs/adr/` — decisions (mirror doctrine, events-not-activities, coach API, models, Expo)
- `docs/research/` — intervals.icu API brief, OpenRouter model brief, training-knowledge summary, eval log
- `docs/ISSUES-VISION.md` — the vision-session issue list (look-and-feel + QA)
- `.zcode/agents/` — personas for the AI team (ui-builder, coach-tuner, visual-reviewer, qa-parity)

## License

MIT for the code — see [LICENSE](LICENSE). Note: the docs embed QA screenshots
and reference the training knowledge base, which distills published training
literature (principles only, no reproduced text) — keep that framing intact in
any redistribution of the docs.

## Safety

Every calendar mutation is a proposal you approve in a modal — the AI cannot
write to intervals.icu on its own. Training guidance is educational
(synthesized from published training science + your data), not medical advice: pain,
injury, or health red flags mean a professional, not a plan tweak.
