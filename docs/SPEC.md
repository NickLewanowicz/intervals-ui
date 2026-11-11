# intervals — Product Spec

A simplified view of your [intervals.icu](https://intervals.icu) training, with
an AI coach that plans — and **you approve every change** before it touches
your calendar.

- **App:** https://intervals.imnick.dev (Cloudflare Pages — Expo web export)
- **Coach API:** https://intervals-coach.imnick.workers.dev (Cloudflare Worker, native 6-hourly sync cron)
- **Data:** PocketBase https://intervals.pockethost.io (rebuildable mirror of intervals.icu + app state)
- **Repo:** https://git.imnick.dev/nick/intervals (private)

## Who it's for

Nick (one athlete, BYO-keys) — and eventually anyone with an intervals.icu
account, a Google account, and an OpenRouter key. Single-user-simple,
multi-user-safe.

## The product in one flow

1. **Splash** (`/`) — what the app is, how it works, sign-in CTA.
2. **Sign in** — Google OAuth via PocketBase (live since Nov 2026; email
   + password remains as fallback; see `docs/AUTH.md`).
3. **Onboarding** (first sign-in) — connect intervals.icu (athlete ID + API
   key from *intervals.icu → Settings → Developer*), add your OpenRouter API
   key (BYO), pick the coach model, optional athlete profile (goals).
4. **Calendar** — your training at a glance:
   - Week view (default, Mon–Sun) and month view; free navigation backward
     (history) and forward (plans).
   - Planned sessions from the intervals.icu calendar (name, distance/time,
     planned load); races badged (`RACE_A/B/C`); recorded activities shown
     with actuals and linked to the plan they fulfilled.
   - Weekly stats strip: planned vs actual km, time, training load, longest
     run, time-in-zone distribution.
   - Day detail: full workout description, actuals, zone breakdown.
5. **Coach** — chat with your training data:
   - "What does my week look like?" → grounded summary.
   - "Feedback on last week?" → references actuals (load, zones, form trend).
   - "I registered for a 10K on Nov 8" → proposes the race on the calendar.
   - "Build my plan for the next 4 weeks around it" → proposes sessions.
6. **Steering modal** — every calendar write arrives as a *proposal*:
   - A modal (web) / bottom sheet (mobile) shows exactly what would be added,
     changed, or deleted — date, name, category, workout description,
     distance/duration, and the coach's rationale.
   - **Approve** → the coach API writes it to intervals.icu with *your* API
     key, mirrors sync back, the calendar updates. **Dismiss** → nothing
     happened. No third option exists: nothing is ever written without an
     explicit approve.
7. **Settings** — keys (intervals.icu, OpenRouter), model choice, units,
   athlete profile, sync status.

## Non-goals (v1)

- Editing workouts in a structured builder (the coach writes
  intervals.icu-syntax descriptions; humans can fine-tune on intervals.icu).
- Multi-athlete coach sharing, clubs, social.
- Garmin/Strava integrations (intervals.icu already does those; we read the
  result).
- In-app workout file (zwo/fit) editing.

## Hard rules

1. **Steered writes only.** The AI never writes to intervals.icu directly;
   every mutation is a proposal the user approves. The coach API refuses
   anything else (see `packages/core/proposal.ts` validators).
2. **The real calendar is sacred in testing.** Agents must never apply
   proposals against the production athlete. Evals validate payloads in
   memory only. (Codified in `AGENTS.md` non-negotiable #4.)
3. **BYO keys.** The app ships zero LLM credentials; users' OpenRouter and
   intervals.icu keys live (hidden) on their PocketBase record and are used
   server-side only.
4. **intervals.icu is canonical; PocketBase is a mirror.** A wiped PocketBase
   re-syncs in minutes (`node tools/pb_sync.mjs`). See ADR-0001.
5. **Naming trap:** adding a run to the schedule = creating an **event**
   (`POST /athlete/{id}/events`, `EventEx`). The /workouts library is a
   separate reusable-template store we don't use. Races are events with
   `category: RACE_A|B|C`. See ADR-0002 + `docs/research/intervals-api-brief.md`.

## Surfaces

| Surface | Where | State (2026-10-24) |
|---|---|---|
| Splash | `apps/expo/app/(marketing)/index.tsx` | scaffolded (grayscale) — visual pass pending |
| Sign-in | `apps/expo/app/(auth)/sign-in.tsx` | Google OAuth primary (live), email+password fallback |
| Calendar | `apps/expo/app/(app)/calendar/` | scaffolded against real mirror data |
| Coach chat | `apps/expo/app/(app)/coach/` | SSE streaming + proposal modal scaffolded |
| Steering modal | `apps/expo/app/(app)/coach/ProposalModal.tsx` | functional; visual pass pending |
| Settings | `apps/expo/app/(app)/settings/index.tsx` | key entry, model picker, units |
| Coach API | `apps/worker/src/index.ts` | **live + verified** (chat, proposals, sync, cron) |
| Mobile (native) | `apps/expo` | same codebase; iOS/Android builds deferred (see ISSUES-VISION) |
