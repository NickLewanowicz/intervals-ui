# Elin — The Mobile-First Commuter · QA round (mobile-only)

- **Persona:** Elin — working parent, trains 6am before the house wakes. Sees this
  app on a phone, one-handed, in 30-second windows. Cares about: today's run,
  this week at a glance, the coach answering fast.
- **Date:** 2026-10-26 · **Platform:** web (headless Chromium), **viewports:**
  375×812 primary, 390×844 rotate-check · **Stack:** isolated local QA
  (`http://127.0.0.1:8788` app, `:8090` PocketBase, `:8099` coach-API mock).
  Production was never touched (read-only not even needed here).
- **Account:** qa-racer@intervals.test (racer data: tune-up done, 10K goal in
  3 weeks). No credentials in this report.
- **Driver:** `.scratch/swarm/elin/driver.mjs` (phases: `dark`, `light`, `w390`,
  `all`) + touch-scroll/modal probes in the same dir; raw metrics in
  `.scratch/swarm/elin/findings.jsonl`.
- **Registry:** 24 captures under `qa-screenshots/registry/2026-10-26/92c936f/elin/`
  (`latest/elin/` has the current per-surface view). All steps screenshot at 375.

**Verdict up front — could I run my training from this app on a phone, in tiny
windows, one-handed?** **Yes, for the daily loop.** Today's run is front and
center, the week reads in one glance, the coach answers fast, and approving a
proposal is a two-thumb-tap affair that shows me exactly what I'm approving.
The one real hole: the deep-link day screen is a content dead-end, and the
proposal sheet's failure state is silently broken. Details below.

---

## Step-by-step

### 1. Sign in — 👍
Clean, labeled fields, real error copy, button mid-screen. Smallest text 13px.
Zero friction in a one-handed pre-caffeine window. (Shot `01-signin`.)

### 2. Calendar — 👍 with two 🤨
- 👍 **Today's run is obvious.** Week opens auto-scrolled to today, `MON 26` chip
  highlighted, today's `06:00 Easy 6km` is the first row with distance/time/load
  and a `PLANNED` chip. No hunt. (This was persona finding #9's fix working.)
- 👍 **The week reads in one glance:** Mon→Sun rows with rest days marked, km·load
  per day, `THIS WEEK` summary card (39.0km / 3h18m / load 229 / form +1 neutral).
- 🤨 The summary card's **done-vs-planned bars read as a bug at 6am**: an empty
  dash hovering above "39.0km" / "3h18m". I had to think about which number was
  which. Make the bar+label pairing self-explanatory.
- 🤨 The floating summary card **slices the day-row text scrolling beneath it**
  (a half-clipped "Tuesday" right at the card's bottom edge — shot
  `calendar-week`). Add a fade/mask so content dissolves under the card.
- Nit: "Long run 16k" peeks from behind the floating tab bar until scrolled.

### 3. Tap into a day — 👍 sheet / ✋ deep link
- 👍 **The HeroCard tile → "Your training, right now" sheet is the 30-second
  gold**: coach sentence ("0 of 229 planned load against a hold-flat of ≈333/wk"),
  THE GAP (333/229/+104), FITNESS (CTL 49.3 / ATL 48.0), RECOVERY (HRV 62 / RHR
  48 / sleep 7h22m). Dark, legible, scrollable, closable by backdrop tap. This
  alone answers "should I adjust today?" in one window.
- ✋ **The deep-link route `/calendar/day` is a dead end.** Title, "Easy 6km
  PLANNED, 06:00 · Run" — then ~700px of nothing: no description, no workout
  steps, no "mark done / skip" action, nothing to scroll (probe: scrollable
  delta 0). If a notification or widget deep-links me here at 6am, I know the
  run's name and nothing else. Give this route the same DayDetails content and
  at least one action.
- Nit: the status sheet is full-screen with the close × top-right — fine since
  backdrop-tap works, but a swipe-down grabber would be more thumb-native.

### 4. Coach — 👍
- 👍 **Fast.** Time-to-first-visible-token **78ms dark / 81ms light** against the
  mock LLM (production LLM latency will dominate — but the streaming UI itself
  is immediate: caret, no layout jank, composer disables cleanly).
- 👍 **Reply readability:** one bubble, ~16px text, generous line height, no
  wall-of-text even at 4+ sentences. Transcript scrolls, input + send pinned
  bottom-right (44×44px, thumb-perfect).
- 👍 Pending-proposal banner ("2 pending proposals to review — tap to open") and
  the Coach tab badge are visible in **both** themes (checked badge crop at 2x).
- 🤨 Suggested-reply chips overflow the right edge with **no scroll affordance**
  (half a chip is visible). Either center the first chip or fade the cut edge so
  I know the row scrolls.
- Nit: disclaimer "Educational — not medical advice." is 11px — acceptable for a
  one-liner, but it's the smallest text on the screen.

### 5. Proposal review (steered writes) — 👍, with a ✋ for the failure state
Healthy-stack experience (shot `proposal-dialog`):
- 👍 Coach's rationale is the **first** thing on the sheet, then intent + full
  detail: WHEN (2026-11-03 · 07:00), NAME, CATEGORY chip, DISTANCE 5.0km,
  DURATION 30m, SPORT, workout bar + expandable "View workout text". Everything
  I'm approving is on-screen at 375×812 with no scrolling past the buttons.
- 👍 Approve / Dismiss are 44px tall, side by side at y≈689–733 — dead center of
  thumb reach. The "you approve every change — nothing is written yet" hint sits
  right under them.
- 👍 Dismiss closes the sheet and the transcript card flips to `dismissed`
  instantly (shot `proposal-after-dismiss`). Verified again via the batch path.

✋ **Degraded state is silent.** When the QA stack hiccuped mid-round (client
holding a chat session wiped server-side), the SSE proposal arrived with no
id/payload and the sheet rendered as just "Add to calendar" + Approve/Dismiss —
**no details at all** — and tapping Dismiss did **nothing visible** (no error,
no close; the code path sets an error but none appeared). A blind-approve trap
and a dead-tap trap in one. The sheet should refuse to render actionable
buttons when the proposal payload/id is missing, and surface the action error.

### 6. Settings — 🤨
- 👍 Legible: account card, intervals.icu connection (athlete id, write-only API
  key with hold-to-peek, test connection, sync status), AI coach (BYO key,
  model radios), athlete-profile editor with char counter and inline Save.
  Min real text 10–11px (the "default" chip and hint lines) — small but crisp.
- ✋/🤨 **Wheel/trackpad scrolling is dead on this screen** (three screenshots
  identical after 2×900px wheel scrolls); touch-drag scrolls fine (854px of
  travel, verified via CDP touch events), so phones pass — but iPad/trackpad
  users can't reach Preferences at all. Also: content runs under the floating
  tab bar with no bottom padding — the Model row is clipped at the fold.
- 👍 Theme override (System / Light / Dark radios) works and — by design —
  persists to the account, which then beats OS dark on the next full load.
  Correct per spec ("PB record wins"), worth knowing when debugging themes.

### 7. Light theme pass (settings override) — 👍
Full parity: calendar, week rows, coach reply (TTFT 81ms), settings, chips and
badges all hold contrast; nothing washes out, no dark-only assumptions spotted
(shots `calendar-light`, `coach-reply-light`, `settings-scrolled-light`).

### 8. Rotate-width 390×844 — 👍
Zero horizontal overflow at **both** widths on every tab
(`scrollWidth == clientWidth` at 375 and 390; probe scans worst offender
right-edge across all elements). The only intentional horizontal scroller is
the suggested-reply chip row.

### 9. One-handed ergonomics — 👍
- Floating tab bar occupies y746–796 of 812 — all three tabs in the thumb arc.
- The primary loop is all bottom-weighted: send button (44px, bottom-right),
  coach composer, Approve/Dismiss (y689–733), status-sheet content.
- Top-weighted items (Go to today, week nav, back chevron on the day route) are
  secondary controls — a stretch, not a blocker.
- 16 sub-44px targets on calendar (day-strip pills, sync chip) — none are
  primary actions; acceptable.

---

## Top-5 mobile fixes

1. **Give `/calendar/day` real content and an action** — description/workout
   steps (same DayDetails the sheet uses) + at least "Mark done/Skip". Today a
   deep link lands on a name and 700px of empty space.
2. **Harden the proposal sheet's degraded/failure state** — if proposal id or
   payload is missing, render a "details unavailable" state with the buttons
   disabled; when an action fails, actually show the error (currently a silent
   dead Dismiss + detail-less sheet invites blind approvals).
3. **Fix the weekly summary card's done-vs-planned read** — bar+label pairing
   that doesn't look like a rendering bug ("—" over 39.0km), and fade content
   under the card's bottom edge instead of slicing text mid-glyph.
4. **Settings: fix wheel scrolling and add bottom padding** so Preferences and
   the Model row aren't unreachable (trackpad/iPad) or clipped behind the
   floating tab bar.
5. **Suggested-reply chips: show that they scroll** — center the first chip or
   fade the right edge; today the cut-off chip just looks broken.

## Appendix — QA-stack notes for the Maintainer

- **Port 8099 service swap:** the round started against a stack where
  `qa_mock_llm.mjs` (OpenRouter stub) had replaced `qa_mock_worker.mjs`
  (coach API) on 8099 — the app bundle calls `/api/*` coach endpoints there, so
  everything CORS-failed until I restarted `qa_mock_worker.mjs 8099`.
  Recommendation: `qa_stack.sh start` should start the worker mock (or app
  personas should get a documented `qa_swarm` wrapper that does).
- **`qa_mock_worker.mjs` never calls its own `superuser()`** for `/api/*`
  (dead code at line 26) — PB writes run anonymous and only succeed because the
  QA PB rules are permissive. Production-parity would be to authenticate.
- **Theme gotcha:** `theme` on the user record (set by Settings, wins over OS
  by design) flipped my first "dark" captures to light after any full page
  load. The driver now resets the persona's theme to `system` before dark/w390
  phases and after the light phase; persona left as seeded, 0 pending
  proposals (stray rows from diagnostics dismissed via the app's batch API).
- **TTFT numbers are mock-LLM** (78–81ms) — they validate streaming UX, not
  production latency.
- Artifacts: `driver.mjs`, `probe-touch-scroll.mjs`, `probe-modal-side-effect.mjs`,
  `probe-day-theme.mjs`, `debug-dismiss.mjs`, `findings.jsonl`, `snaps/`,
  `shots/` (all under `.scratch/swarm/elin/`), registry index
  `qa-screenshots/registry/index.jsonl`.
