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

![Calendar — week view on desktop web](docs/screenshots/calendar-week-desktop-dark.png)

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

A tour through the app — web (desktop) and mobile, dark unless noted.

**Calendar**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/calendar-week-mobile-dark.jpg" width="250" alt="Week view — mobile"><br><sub>Week — mobile</sub></td>
    <td align="center"><img src="docs/screenshots/calendar-month-dark.jpg" width="250" alt="Month view — mobile"><br><sub>Month view</sub></td>
    <td align="center"><img src="docs/screenshots/calendar-week-race-dark.jpg" width="250" alt="Race week with badges"><br><sub>Race week</sub></td>
    <td align="center"><img src="docs/screenshots/day-peek-mobile-dark.jpg" width="250" alt="Day peek sheet — mobile"><br><sub>Day peek sheet</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/theme-calendar-light.jpg" width="400" alt="Calendar — light theme (desktop)"><br><sub>Light theme (web)</sub></td>
    <td align="center" colspan="2"><img src="docs/screenshots/theme-calendar-dark.jpg" width="400" alt="Calendar — dark theme (desktop)"><br><sub>Dark theme (web)</sub></td>
  </tr>
</table>

**Day detail — workout text, actuals, zone bars**

![Day detail on desktop web](docs/screenshots/day-detail-recorded-light.png)

**Stats**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/status-sheet-dark.jpg" width="400" alt="Your training, right now"><br><sub>"Your training, right now"</sub></td>
    <td align="center"><img src="docs/screenshots/status-sheet-zones-dark.jpg" width="400" alt="Zone mix"><br><sub>Zone mix</sub></td>
  </tr>
</table>

**AI coach**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/coach-chat-dark.jpg" width="250" alt="Coach chat — mobile"><br><sub>Chat</sub></td>
    <td align="center"><img src="docs/screenshots/coach-sessions-light.png" width="250" alt="Coach sessions list"><br><sub>Sessions</sub></td>
  </tr>
</table>

**Proposals — approve every change**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/proposal-modal-dark.jpg" width="400" alt="Proposal review modal with field diffs (web)"><br><sub>Review with field diffs (web)</sub></td>
    <td align="center"><img src="docs/screenshots/bundle-multiselect-dark.jpg" width="400" alt="Bundle multi-select (web)"><br><sub>Bundle multi-select (web)</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/proposal-confirm-mobile-dark.jpg" width="250" alt="Applying a proposal — mobile"><br><sub>Apply — mobile</sub></td>
  </tr>
</table>

**Android home-screen widgets**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/widget-upcoming.jpg" width="250" alt="Upcoming runs widget on a home screen"><br><sub>Upcoming runs</sub></td>
    <td align="center"><img src="docs/screenshots/widget-fitness.jpg" width="250" alt="Fitness trend widget on a home screen"><br><sub>Fitness trend</sub></td>
    <td align="center"><img src="docs/screenshots/widget-nextrace.jpg" width="250" alt="Next race countdown widget on a home screen"><br><sub>Next race</sub></td>
    <td align="center"><img src="docs/screenshots/widgets-picker.jpg" width="200" alt="Widget picker"><br><sub>Pick a widget</sub></td>
  </tr>
</table>

**Getting started**

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/sign-in-google.png" width="400" alt="Google sign-in screen"><br><sub>Google sign-in (primary)</sub></td>
    <td align="center"><img src="docs/screenshots/coach-empty-keybanner-dark.jpg" width="400" alt="First-run banner prompting to add keys"><br><sub>First run — add your keys</sub></td>
  </tr>
  <tr>
    <td align="center" colspan="2"><img src="docs/screenshots/settings-dark.jpg" width="250" alt="Settings with BYO keys"><br><sub>Settings — BYO keys, model picker, themes</sub></td>
  </tr>
</table>

Every feature above is documented with full embedded walkthroughs in
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
