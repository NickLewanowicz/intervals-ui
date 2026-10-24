# Issues — Vision-Session Worklist

Written by the GLM-5.3 (non-vision) orchestrator session, 2026-10-24. This is
the handoff to a **vision-capable** session (e.g. GLM-5.3-Flash). The
infra, data plane, coach API, and app scaffold are live and verified; what
remains needs eyes.

**How to work this list:** read `AGENTS.md` (working agreement) and dispatch
the personas in `.zcode/agents/` (ui-builder implements; visual-reviewer
judges; coach-tuner evals). Labels: **F** = functional (no vision strictly
required, but QA benefits), **V** = visual/UX (vision required), **N** =
later. Each issue = one Gitea issue (they are mirrored there; this file is
the source of truth). Verify every F/V fix on https://intervals.imnick.dev
after CI deploys it.

Dev sign-in: email+password in `.scratch/dev-user.txt` (Google OAuth pending,
issue V-08). The account is already connected to intervals.icu athlete
`i167187` with seeded mirror data and a working OpenRouter key.

---

## V-01 · Splash page: the 80/20 product story (V)
**Where:** `apps/expo/app/(marketing)/index.tsx`
**Technical:** static route; content sections; CTA → `/sign-in`.
**Prescribed content (copy-delegate wording, structure fixed):**
1. Hero: product name + one-liner ("Your training, coached." / "A simplified
   view of your intervals.icu — with an AI coach that plans, and you approve
   every change.")
2. **The 80/20 section (headline):** explain the 80/20 principle in 2–3
   sentences — elites train ~80% easy, and the coach keeps the athlete's week
   in that distribution; link/expand to the method. This is the product's
   anchor — give it real visual weight.
3. "Where the coaching comes from": cite the knowledge base —
   *80/20 Running* (Fitzgerald & Johnson) and *Run Like a Pro (Even If You're
   Slow)* (Fitzgerald & Rosario), distilled into the coach's guidance
   (principles, not text).
4. How it works: Connect intervals.icu → chat with your coach → approve
   changes on your calendar (3 steps, icons/numbers).
5. Footer disclaimer (required verbatim-intent, style it):
   educational guidance from distilled training literature and your own
   data — not medical or professional advice; pain/injury → see a
   professional; do your own due diligence.
**Look-and-feel:** delegated (typography scale, spacing, motion, art).
**Done when:** mobile + desktop widths read beautifully; CTA reachable;
disclaimer visible without scrolling more than one viewport past 80/20.

## V-02 · Calendar week view + day detail polish (V)
**Where:** `apps/expo/app/(app)/calendar/index.tsx` (+ day detail).
**Already functional:** week/month navigation, planned vs recorded entries,
races badged, weekly stats strip, day detail with description + actuals.
**Prescribe:** race entries visually distinct at a glance (color/badge);
completed-vs-planned state obvious (check/actuals); today marker; empty
weeks friendly; sync button + last-sync timestamp visible; zone-times bar in
day detail (proportional stacked bar from `zone_times`).
**Done when:** a week can be read in <3s: what's planned, what's done, how
hard, is a race coming.

## V-03 · Coach chat screen polish (V)
**Where:** `apps/expo/app/(app)/coach/index.tsx`.
**Prescribe:** streaming text renders as it arrives (already wired); model
chip (from roster label); proposal cards inline in the transcript after
approval/dismissal (status shown: pending/applied/dismissed); input with
send/disabled states; error surfaces readable (OpenRouter 502 etc.); a small
"Educational — not medical advice" footer note in the chat.
**Done when:** a full conversation incl. one proposed+approved session flows
without layout jumps; 375px and 1280px both work.

## V-04 · Proposal modal / steering sheet (V) — **the core differentiator**
**Where:** `apps/expo/app/(app)/coach/ProposalModal.tsx`.
**Prescribe:** bottom sheet on mobile widths, centered modal on desktop;
content: action verb ("Add to calendar" / "Update" / "Delete"), date+time,
name, category chip (WORKOUT / RACE A–C), formatted description
(monospace-ish block), distance + duration, rationale in the coach's voice;
Approve (primary) / Dismiss (secondary) / "keep chatting to adjust" hint;
applied state confirmation + link/jump to that day; failed state shows the
error and offers retry (re-approve).
**Done when:** a race proposal (RACE_A) and a workout proposal both read
unambiguously; no accidental double-approve (idempotent buttons).

## V-05 · Settings + onboarding polish (V/F)
**Where:** `apps/expo/app/(app)/settings/index.tsx` (+ first-run flow).
**Prescribe:** key inputs masked with show-toggle; "Test connection" runs
sync and reports counts; model picker (radio list from `MODEL_ROSTER`,
default marked); units toggle; athlete-profile textarea with hint; sync
status card (last_sync, status/error); sign-out. First-run: if
`intervals_api_key` empty → onboarding prompts (calendar → coach gated
softly with an explainer, not a wall).
**Done when:** a brand-new user can go from sign-in → connected → first
coach answer without instructions.

## V-06 · Design language + theme system (V) — foundational for all V-*
**Where:** `apps/expo/src/theme.ts` + shared style constants.
**Prescribe:** finalize the token set (colors incl. race/highlight, spacing
scale, type scale, radii, elevation) — extend the grayscale scaffold; dark
first, light optional; document in `docs/design/DESIGN-LANGUAGE.md`
(reference teardown of intervals.icu + Strava + TrainingPeaks calendars is
welcome; write what you chose and why).
**Done when:** all screens consume tokens only (no hex literals in
components).

## V-07 · Weekly/monthly stats presentation (V)
**Where:** calendar stats strip (+ optional stats route).
**Prescribe:** planned-vs-actual km/time/load tri-pair; time-in-zone mini
distribution; longest run; form (CTL−ATL) trend sparkline from wellness
mirror; month view aggregates 4–5 weeks.
**Done when:** numbers are glanceable and honestly labeled (planned vs
actual never confused).

## V-08 · Google OAuth end-to-end (F, blocked on Nick)
**Blocked by:** `docs/AUTH.md` Part A (Nick creates the OAuth client; ~5 min).
**Then:** Part B one-liner to enable the provider; flip the sign-in button on;
verify popup + native flows; optionally disable password auth + rotate dev
password; update `.env.example`.

## V-09 · Prompt + model quality round 1 (F — coach-tuner persona)
**Where:** `packages/core/src/prompts/coach.ts` + knowledge.ts + evals.
**Prescribe:** expand fixtures to ≥8 (feedback on bad week / HRV crash → down
week; plan 4-week block to 10K; re-plan when race moves; delete proposal;
long-run progression checks; "am I overtraining?" — must not prescribe);
A/B current prompt vs +knowledge-base integration; verify 80/20 rule
adherence in plans (count proposed Z-distribution); log to
`docs/research/eval-log.md`; ship winner; bump `COACH_PROMPT_VERSION`.

## V-10 · Native app build + emulator QA (F/V — ios-simulator/android-emulator tools available)
**Where:** `apps/expo`.
**Prescribe:** `npx expo prebuild` + EAS dev build or expo run:ios/run:android
on the local simulators; verify: PB login (AsyncStorage authStore), calendar,
chat SSE (check fetch streaming on RN!), proposal sheet (bottom-sheet
gesture), settings; file fixes where web-only assumptions crept in
(`Platform` gates, safe-area, touch targets).

## V-11 · Landing → app funnel + shareability (N)
Open graph tags, favicon/PWA manifest, app icon set, "share this week" export
(image) — design + implement.

## V-12 · PocketBase backup runbook (F)
**Where:** `docs/runbooks/`. Wire SFTP `pb_data` pull (creds in root `.env`
docs) or superuser backup-create API on a Gitea schedule; verify restore once
against a scratch instance; document.

## V-13 · Race-countdown + goal-race features (N)
Next-race banner on calendar (from earliest future RACE_A/B/C), days-to-go,
plan-status ("coach: taper starts in 3w").

---

## Order

1. V-06 (tokens) → V-01, V-02, V-03, V-04 (core screens) → V-05, V-07
2. V-09 in parallel (coach-tuner, no UI dependency)
3. V-08 the moment Part A lands; V-10 after core screens stabilize
4. V-11..V-13 last

## Guardrails for this worklist (restated)

- Never apply proposals against the production athlete from QA — use dismiss,
  or apply only when explicitly asked by Nick.
- `pnpm test` + `pnpm typecheck` green before every commit; CI deploys main.
- Every visual judgment needs a screenshot under `qa-screenshots/`.
