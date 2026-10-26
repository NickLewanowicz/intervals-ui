# QA Swarm Synthesis — 14 personas, 2026-10-26

 Moderator synthesis of the 2026-10-26 persona swarm. Inputs: the fourteen
`*-*.md` reports in this directory (Maya, Tom, Priya, Marcus, Elin, Sam,
Devon, Ash, Ada, Kai, Bo, Noor, Jules, Ray). All runs were on the local QA
stack (`127.0.0.1:8788` web / `:8090` PocketBase / `:8099` mock worker);
production and the real athlete (`i167187`) were never touched by any persona.

**Attribution rules applied before filing anything.** Per the round's known
QA-harness artifacts, the following are NOT filed as product bugs:

- Coach replies contradicting seeded data ("38km / load 142 / long run
  Saturday" against a 53km / 275 / Sunday calendar) — the canned mock worker
  is persona-blind. Reported by Marcus, Tom, Noor, Jules, Ray, Maya, Sam,
  Priya; all discounted as grounding evidence. Kai ran the budgeted
  real-LLM proxy and graded the actual coach **A−** (see §C).
- Shared-account wiping / cross-agent contamination between concurrent
  personas (Devon, Kai, Bo, Jules, Noor, Priya, Ada environment notes).
- `qa_stack.sh stop_all` port-squatting and `qa_mock_worker.mjs` crash +
  auth bugs — fixed mid-round by Devon/Ada; carried as QA-infra items (§D)
  to verify and land, not as product findings.

Where a finding has both a harness cause and a real client-side residue
(chiefly the proposal-handoff race), the item below states explicitly what
the harness fix explains and what must still be verified in the client.

---

## 1. Executive summary

Fourteen personas walked the app and returned a verdict that is unusually
consistent: **the product's skeleton is trustworthy and its core contract
holds — but the approval loop's flakiness, one data-honesty bug, and one
dead-end screen are exactly the three things this product cannot afford.**
Nobody said delete outright. Four said keep (Elin, Ash, Kai, Bo — the
personas who tested mobile ergonomics, theming, the real-LLM coach, and the
bundle sheet, respectively), and ten put the app on probation, each naming a
short, specific fix list that overlaps heavily with the others'.

What survived hostile review is remarkable. Marcus re-derived 22 of 26
numbers by hand and the deterministic surfaces — hero tiles, status sheet,
hold-flat, THE GAP — matched to displayed precision, with honest "—" dashes
and no fabricated zeros. Bo's 38-check sweep of the bundle approval sheet
passed clean, including partial-failure retry and double-submit guards.
Kai's six turns against the real model were grounded on every turn with a
correct 10K taper and textbook HRV caution. Ash found zero theme leaks, zero
horizontal overflow at four widths, and a genuinely good failure/Retry story
on the coach. The steered-writes promise — "you approve every change —
nothing is written yet" — is stated everywhere it matters and held under
every stress test.

What failed is concentrated and fixable. The proposal review handoff
intermittently delivers a stub (no id, no payload) that renders a hollow
modal with dead or blind-approvable buttons — Maya 2-of-3, Priya 3-of-5
(empty proposal id POSTed to a 404, silently), Elin's degraded state; Devon's
mock-auth fix explains some instances, but the client still builds
actionable buttons from `id: ''`, so hardening survives the harness fix.
Done days double-count: an unpaired activity renders the planned event as
ghost MISSED alongside the DONE card and sums both into day totals (Noor:
"poisons the entire log"; Marcus confirmed by hand). The deep-linkable
`/calendar/day` route renders a title and 700px of nothing, dropping data
the calendar row behind it already shows (Ray's #1 gripe, Elin's #1 fix,
Jules' "easy relative to what?"). A keyboard-only user can get hard-trapped
in an InfoHint bubble on the calendar's main tab path (Ada, WCAG 2.1.2).
And one bad theme token — the selected-state periwinkle at 1.81:1 contrast —
sits on the pending-proposal banner and every "selected" chip in the app.

The coach itself is in better shape than the mock round made it look: with
the real model, grounding was excellent and the errors Kai did find are
specific and pipeline-fixable (precompute goal math; validate bundle volume
against its own "down week" claim — the same inconsistency Bo caught live).
The work now is to close the gap between what the app promises (a coach you
audit line-by-line) and what the UI currently proves (a coach whose approval
sheet sometimes arrives empty, on a calendar that sometimes shouts MISSED at
runs you did).

---

## 2. Prioritized backlog

### (A) Confirmed product bugs

---

#### A1 · P1 — Proposal review handoff delivers a stub: hollow modal, empty proposal id, silent dead buttons

**Evidence.** Priya (blocker): "3/5 approvals POSTed `/api/proposals//apply`
— **empty proposal id** → 404. Modal stays open, **no error message
renders**… A racer who taps Approve believes their tune-up is scheduled."
Same session: "the modal is a **detail-less shell** — just 'Add to calendar'
+ Approve/Dismiss." Maya (high): "2 of 3 sessions: modal auto-opens with no
rationale/name/date/distance; clicking Approve does nothing — no network
call… proposal stays `pending`, no error, no busy state." Elin: "the SSE
proposal arrived with no id/payload and the sheet rendered as just 'Add to
calendar' + Approve/Dismiss — and tapping Dismiss did **nothing visible**."
Devon's mock-worker auth fix (unauthenticated PB writes producing id-less
`proposal` SSE frames) explains the stub-generation side on the QA stack,
and on his post-fix clean run every modal hydrated and applied; but the
client-side residue is confirmed by Priya's network trace (the client built
and POSTed a proposal whose id is the `?? ''` fallback at
`apps/expo/src/lib/api.ts:145`) and by Maya's zero-network dead click. The
product's entire pitch is this modal; an intermittent silent failure is
worse than a consistent one.

**Acceptance criteria.**
1. `ProposalModal` never renders an enabled Approve/Dismiss unless the
   proposal has a non-empty `id` AND a payload with name + date; a stub
   renders a non-actionable "Proposal details unavailable — check pending
   proposals" state instead.
2. With a hydrated proposal, Approve always POSTs `/api/proposals/:id/apply`
   with that id; a 404/failure flips the modal to its existing failed-state
   UI (already coded, never triggered) — verified by test.
3. Automated regression: simulate a `proposal` SSE frame with missing
   id/payload followed by the pending-list refresh; assert no actionable
   buttons and an error/retry surface. Repeat with hydration-order
   inversion (SSE before list, list before SSE).
4. Approve/Dismiss failures surface visibly within 1s (banner or inline
   error); the pending-proposals banner remains as recovery.

**Suggested files.** `apps/expo/src/lib/api.ts` (SSE `proposal` case,
~139–166: stop defaulting `id` to `''` — drop the frame or mark it
`pending-hydration`), `apps/expo/app/(app)/coach/index.tsx` (the SSE→modal
path vs pending re-list effects, ~477–531 and ~607–647),
`apps/expo/src/components/ProposalModal.tsx` (guard + failed state).

---

#### A2 · P1 — Done days double-count: ghost MISSED badge + planned+actual summed in day totals

**Evidence.** Noor (her #1): "Every recorded run ALSO shows the planned
event as MISSED. Monday Oct 19 renders as '2 runs · 48.1km · load 236' —
but I ran ONCE (24.1km)… My best long run of the block wears a red MISSED
badge." Marcus (confirmed independently by hand-computation, C1/C2): "the
planned event is badge MISSED while an identical same-morning activity is
badge DONE, and the day header counts both (15.9km, load 60)… '2 runs
48.1km' mixes planned + actual meters (24.0+24.1). The arithmetic is right;
the semantics are not what happened." Jules adds the shame dimension: "'MISSED' in caps… the app shouts MISSED at them." Root cause verified in
source: merging is only by explicit `paired_event_id`
(`packages/core/src/digests.ts:101-113`, `packages/core/src/stats.ts`);
there is no same-day/name fallback for unpaired imports.

**Acceptance criteria.**
1. A day containing a planned event and a same-day activity without
   `paired_event_id` renders ONE reconciled representation (planned→done
   with both values visible, e.g. "24.0 planned → 24.1 done"), never a
   MISSED badge plus a DONE card for the same session.
2. Day-header totals count the session once (distance/load match the week
   hero for that week).
3. The word "MISSED" appears only when the window has passed with no
   activity AND no same-day candidate; prefer "not done" wording.
4. Regression seeded with: paired event, unpaired same-day activity, and
   genuinely-missed event — asserting the three render differently.

**Suggested files.** `packages/core/src/digests.ts` (day-cell merge
heuristic), `packages/core/src/stats.ts`, day-card rendering in
`apps/expo/app/(app)/calendar/WeekCards.tsx` / `DayDetails.tsx`.

---

#### A3 · P1 — `/calendar/day` deep-link route renders near-empty: drops distance/duration/load the calendar row already shows

**Evidence.** Ray (his #1 of 7): "Tapping today's 6am run and then 'Open
full' gives me the title, '06:00 · Run', and then a full screen of nothing.
No distance, no duration, no load, no description — even though the calendar
row *behind* the sheet I came from shows `8.0km · 45m · ⚡30`." Elin (her
fix #1): "The deep-link route `/calendar/day` is a dead end… ~700px of
nothing: no description, no workout steps, no 'mark done / skip' action,
nothing to scroll (probe: scrollable delta 0)." Jules: "'Easy 25min' — easy
relative to *what*? The day detail page shows title, PLANNED, and '06:00 ·
Run' and nothing else." Note: `day.tsx` already renders the shared
`DayDetails` component — so the emptiness indicates the route's data
window (`useCalendarWindow(date, date)` — a single-day query) returning no
events where the week query succeeds. Verify that first; the fix may be one
query wide.

**Acceptance criteria.**
1. For any date visible in week view, `/calendar/day?date=…` renders the
   same content as the in-calendar day sheet (name, status, time, distance,
   duration, load, workout steps if present).
2. Deep-linking directly to a date with events (cold start, no prior
   navigation) shows the data — not a lone header.
3. The route exposes at least one forward action (e.g. "Ask the coach about
   this session" or week nav), and rest days render the rest state rather
   than blank space.

**Suggested files.** `apps/expo/app/(app)/calendar/day.tsx`,
`apps/expo/app/(app)/calendar/DayDetails.tsx`,
`apps/expo/src/lib/queries.ts` (`useCalendarWindow` single-day path).

---

#### A4 · P1 — InfoHint bubble traps keyboard focus on the calendar's main tab path (WCAG 2.1.2)

**Evidence.** Ada (P1): "34 Tab stops from page top to the tab bar… two
info-i tooltips sit directly on that path (stops 11 and 13). Focusing either
pops a full-screen modal bubble that (a) disrupts the Tab order while open…
and (b) has a reachable state where **Escape is dead** and Tab/Shift+Tab are
contained inside the bubble's two nodes: only a mouse click escapes."
Root cause in source: `Hint.tsx` adds its own `window` keydown handler
(~:141–146) which is dead once focus is inside the RNW `Modal` — the exact
pattern DetailSheet/ProposalModal avoid by relying on `onRequestClose`.

**Acceptance criteria.**
1. From page load, Tab reaches the Calendar/Coach/Settings tab bar with no
   pointer input, with two InfoHints focused en route, on every pass.
2. Escape closes the hint bubble from any focus position inside it (or the
   bubble is replaced by a non-modal popover that never traps).
3. Focus moves into the bubble on open (or stays on the trigger with the
   popover non-modal) and returns to the trigger on close; close on blur.
4. Regression: scripted Tab walk past both hints ×20 iterations, zero trap
   states.

**Suggested file.** `apps/expo/src/components/Hint.tsx` — drop the
window-level keydown + full-screen Modal for the DetailSheet's proven
`onRequestClose` pattern (Ada's fix direction).

---

#### A5 · P2 — Sync with no intervals.icu key reports success

**Evidence.** Sam (F2): "Tap Sync now → toast `Synced 0 events · 0
activities`, header flips to 'synced 2m ago', Settings shows 'Sync status:
ok'. No error, no 'add your intervals.icu API key first'." The real Worker
returns `missing_intervals_key` 400 (`apps/worker/src/index.ts:134`), so
production fails differently — but the app-side shape ("treat 0/0 as
success, no credential check") still bites, and the mock masks it.

**Acceptance criteria.**
1. With no stored key, "Sync now" is disabled or routes to Settings
   ("Connect intervals.icu to import your training") instead of toasting
   success.
2. A 0-events/0-activities result never flips the header to "synced Xm
   ago" on an unconnected account.
3. `tools/qa_mock_worker.mjs` mirrors the Worker's `missing_intervals_key`
   shape (pairs with §D2).

**Suggested files.** `apps/expo/app/(app)/calendar/index.tsx` (sync handler
~:254), `tools/qa_mock_worker.mjs`.

---

#### A6 · P2 — Duplicated proposals from a single chat turn

**Evidence.** Maya (med): "a single 'Schedule an easy 6k shakeout this
Friday' left 1 `applied` + 2 stray `pending` rows (PB created
21:08:46/47/50). Either the client retries `/api/chat` without dedup or the
worker double-streams." Single-source for now, but it is a duplicate write
one approval away from the calendar this product promises to protect.
Verify-first: Devon's clean run produced exactly one proposal per turn, so
this may have been retry-behavior under the pre-fix mock's failures — but
it must be repro-gated, not assumed away.

**Acceptance criteria.**
1. One chat turn produces at most one proposal per tool call, provable in
   PB across 20 scripted "schedule" turns including simulated network
   retries.
2. If a retry re-sends `/api/chat`, an idempotency key (or server-side
   turn-dedup) prevents a second proposal row for the same turn.

**Suggested files.** `apps/expo/app/(app)/coach/index.tsx` (send/retry
path), `apps/worker/src/index.ts` (chat handler), `apps/expo/src/lib/api.ts`.

---

#### A7 · P2 — Assistive state missing: bundle checkboxes and settings radios expose no checked state; Space doesn't toggle

**Evidence.** Bo (high, a11y): "The row toggle renders `<div role="checkbox"
tabindex="0" …>` with **no `aria-checked` attribute at all** — verified in
DOM (`accessibilityState={{ checked }}` is passed in
`ProposalBundleSheet.tsx` but never lands in the ARIA output). WCAG 4.1.2."
Plus "Space does not toggle a focused checkbox (Enter does)." Ada (F4,
moderate): settings model/theme/unit radios pass
`accessibilityState={{ selected }}` but RNW maps neither `aria-checked` nor
`aria-selected` — verified empty on all 8
(`settings/index.tsx:217/298/319`). Same RNW `accessibilityState` mapping
root cause; one fix pattern covers both.

**Acceptance criteria.**
1. DOM shows `aria-checked` (true/false) on every bundle row checkbox and
   every settings radio.
2. Space toggles a focused bundle checkbox; Enter continues to work.
3. Screen-reader announcement includes state ("Include … , checked").

**Suggested files.** `apps/expo/src/components/ProposalBundleSheet.tsx`
(~:404), `apps/expo/app/(app)/settings/index.tsx` (`checked: selected`),
`apps/expo/src/components/ui.tsx` (shared radio/checkbox mapping if one
exists).

---

#### A8 · P2 — Selected-state contrast token fails WCAG (1.81:1) and it's the most important state on screen

**Evidence.** Ray (systematic, probe-measured): "Periwinkle
`rgb(150,169,255)` on translucent indigo computes to **1.81:1** (needs 4.5)
and shows up on: the 9px bold weekday letters in every day chip… the '1
pending proposal to review' banner, and the *selected* System/Kilometres
chips in Settings. The most important state on screen is the hardest to
read." Related votes: Ash + Maya on the disabled "Save profile" button
(white on pale lavender, barely legible in light theme; Maya adds the
affordance reads ambiguous even when merely idle).

**Acceptance criteria.**
1. Every text pair involving `accentText`/selected-state (day-strip
   letters, pending-proposals banner, selected segmented chips) measures
   ≥ 4.5:1 against its effective background in both themes (automated
   contrast probe in the app's test harness).
2. Disabled "Save profile" is legible (≥ 3:1 large-text) and its
   idle-vs-disabled state is visually distinguishable (label change or
   dirty-dot).

**Suggested files.** `apps/expo/src/theme.ts` (:77 `accentText: '#96a9ff'`
— pick a passing accent or darken the selected-chip fill),
`apps/expo/src/widgets/widget-theme.ts` (same token),
`apps/expo/app/(app)/settings/index.tsx` (Save button styling).

---

#### A9 · P2 — Route-scoped theme leaks: Chats screen flashes white in dark; Settings rendered light under system-dark; hard-coded light page underlay

**Evidence.** Ray: "The Chats screen flashes light theme — white background
while Appearance = System and the system is dark… everything else respects
dark." Priya: "Settings renders LIGHT while calendar + coach render DARK
(system theme = dark). Looks like a different app." (Elin's account-theme
gotcha — the persisted user `theme` beating the OS — may explain some
instances; verify per-route against a system-dark account with
`theme=system`.) Ash (latent, probe-verified): the full-viewport page
backdrop is hard-coded light `rgb(242,242,242)` in dark mode
(surfaces in the built output as `rgba(242,242,242,1)` on the root
underlay) — invisible normally, but it is the effective page background and
will flash on overscroll/paint gaps.

**Acceptance criteria.**
1. With account theme = system and OS dark, every route (including
   `/coach/sessions` and `/settings`) samples dark palette colors — add the
   per-route color census to the theme test.
2. The root page underlay is painted from the active palette in both
   themes; overscroll in dark never reveals light.
3. Regression covers the Elin gotcha: user-persisted theme override still
   wins by design, and the Settings UI reflects which source is active.

**Suggested files.** `apps/expo/app/(app)/coach/sessions.tsx`,
`apps/expo/app/(app)/settings/index.tsx` (route-level theme provider
usage), root layout underlay (locate the absolute full-viewport backdrop
layer; source it from `apps/expo/src/theme.ts`).

---

#### A10 · P2 — Session-type chips mislabel sessions in both directions (regex first-hit + WORKOUT display name)

**Evidence.** Marcus (B2, med): "the `/interval|…|\d\s*[x×]\s*\d|strides?/`
rule tags '…+ strides' as **Intervals**, and the ×-rule fails the canonical
'8×(2′ …)' format so the real interval session falls through to the `easy`
word-match and gets tagged **Easy**." Maya (med): "a Z4 session labeled Easy
is exactly the kind of wrong I can't forgive in a training log" (same
examples, cites `apps/expo/src/lib/week-view.ts:94`). Tom + Jules (independently): the seeded `WORKOUT` category on a strides day renders as the
chip "Intervals" — "the scariest possible word" (Jules) in an injury-return
plan. Two root causes, one user-visible symptom: wrong chips.

**Acceptance criteria.**
1. "Easy aerobic + strides" is not tagged Intervals; "Run club — 8×(2′ Z4 /
   2′ easy)" is not tagged Easy (fix the `\d\s*[x×]\s*\d` pattern for the
   `8×(` form and/or demote `strides?` from the Intervals rule, or
   confidence-gate the chip per Maya's wish).
2. Category `WORKOUT` renders as "Quality" (or the event name), never
   "Intervals".
3. Unit tests over the persona seed names assert expected tags; a wrong
   chip is worse than no chip, so `null` is acceptable output.

**Suggested files.** `apps/expo/src/lib/week-view.ts` (`TAG_RULES` ~:94),
category-label map where WORKOUT → display string.

---

#### A11 · P2 — Week view has no URL, no reload persistence, no arrow-key navigation; status sheet is date-blind

**Evidence.** Noor (#4): "Walking back 2 weeks keeps URL `/calendar`; a
reload snaps to the current week… I cannot bookmark, share, or refresh 'the
week I was reviewing'. Keyboard ←/→ don't navigate weeks either." Noor
(#5): "Opened from race week (Dec 21–27) it says 'You're at 0 of 275
planned load…' — that's THIS week (Oct 26) wearing no label. It should name
the week it describes." (The GAP +32 sign convention compounds it — "the
sign reads backwards unless you decode it as 'load still to add'"; Ray and
Jules both re-read it twice.)

**Acceptance criteria.**
1. Week navigation updates the URL (`/calendar?week=2026-W44` or
   `?start=YYYY-MM-DD`); reload/restore lands on the reviewed week; days
   keep their existing deep links.
2. ←/→ keys move one week when the calendar surface has focus (no modifier
   capture conflicts with Ada's keyboard map).
3. The status sheet labels its week ("Week of Oct 26 – Nov 1") and states
   the gap directionally ("32 load under your maintenance") in addition to
   the sign.

**Suggested files.** `apps/expo/app/(app)/calendar/index.tsx` (window
state → search params), `apps/expo/app/(app)/calendar/StatusSheet.tsx`.

---

#### A12 · P2 — Stop-mid-stream leaks an internal error and offers a double-send Retry

**Evidence.** Devon (B1, med): "a red error row then appears:
'BodyStreamBuffer was aborted' with a Retry button… undici's internal abort
message leaking through `send()`'s catch-all in
`apps/expo/src/lib/api.ts`… **Retry re-sends the whole message**, so a user
who stops and then reflexively clicks Retry double-sends." Ash (C3)
corroborates the register problem: raw transport error text renders
verbatim mid-stream, where the pre-stream banner uses the right wording.

**Acceptance criteria.**
1. A deliberate Stop shows no error row (or a muted "Stopped — reply cut
   short" note), keeps the partial, and offers no Retry for that turn.
2. Post-abort body-read errors are classified as intentional stops, not
   stream failures (unit test on the transport parser).
3. Mid-stream failures use the same human copy as the pre-stream banner
   ("Coach service unreachable — check your connection and retry."),
   never raw transport text.

**Suggested files.** `apps/expo/src/lib/api.ts` (`send()` error
classification), `apps/expo/app/(app)/coach/index.tsx` (banner/Retry
rendering).

---

#### A13 · P2 — Settings screen can't scroll by wheel/trackpad and clips under the floating tab bar

**Evidence.** Elin (her fix #4): "Wheel/trackpad scrolling is dead on this
screen (three screenshots identical after 2×900px wheel scrolls);
touch-drag scrolls fine… iPad/trackpad users can't reach Preferences at
all. Also: content runs under the floating tab bar with no bottom padding —
the Model row is clipped at the fold." Sam (F7) and Ray corroborate the
under-tab-bar clipping (DeepSeek model option partially covered). Same
pattern on desktop month view: Maya — "the day-detail card at the bottom is
occluded by the floating tab bar with no visible scroll cue."

**Acceptance criteria.**
1. Wheel and trackpad scrolling reach the bottom of Settings (and every
   scrollable surface) in a headless probe.
2. Every scrollable route reserves bottom padding ≥ tab-bar height; the
   last interactive element is fully visible at rest.
3. Desktop month view's selected-day card is reachable (scroll cue or
   padding below the grid).

**Suggested files.** `apps/expo/app/(app)/settings/index.tsx`
(scroll/pointer config + `contentContainerStyle` padding), shared tab-bar
padding helper, `apps/expo/app/(app)/calendar/index.tsx` (month view).

---

#### A14 · P3 — Desktop calendar first paint scrolls past its own header and empty state

**Evidence.** Sam (F1, BROKEN): "the inner ScrollView mounts at
`scrollTop: 272` — the whole header block… sits at y≈-240, off-screen, and
the empty-state card is below the fold… The empty state's one job — telling
you what to do — is invisible on desktop." Cause: the mount
`scrollToDate(today)` at `apps/expo/app/(app)/calendar/index.tsx:138`
(added so today isn't hunted for) overshoots when the week has no events.

**Acceptance criteria.** Skip the mount scroll when the window has zero
events (or scroll only when today's card is below the header); desktop
1280×800 first paint shows the header + empty state; regression with an
empty seeded week.

**Suggested file.** `apps/expo/app/(app)/calendar/index.tsx` (:122–145).

---

#### A15 · P3 — Settings copy and placeholder bugs (real athlete ID as placeholder; "leave blank to keep" with no key)

**Evidence.** Sam (F4) + Jules + Priya (a11y label), independently:
"Athlete ID placeholder is `i167187` — that is a *real production athlete
ID*… Showing it as the example invites typos that point at someone else's
account." Sam (F5): "'Leave blank to keep the saved key' on an account that
has **no saved key**." Both are one-line edits with outsized trust value.

**Acceptance criteria.** Placeholder reads `i123456`; key fields read
"No key saved — paste yours to connect" until a key exists; the athlete-ID
a11y label no longer contains any real ID.

**Suggested file.** `apps/expo/app/(app)/settings/index.tsx` (~:172).

---

#### A16 · P3 — Chat history false-empty on fetch failure; second tab is signed out

**Evidence.** Jules (#3): "Mid-flow I was dumped to the logged-out page,
and Chat history then said *'No chats yet.'* The data wasn't gone… an empty
state must not claim 'no chats' when a fetch failed." Noor: "Second browser
tab while signed in: the new tab is signed OUT (session appears to be
per-tab)." Low frequency, high scare value (looks like data loss).

**Acceptance criteria.** A failed history fetch renders an error/retry
state, never the empty state; shared-session behavior across tabs is either
implemented or documented as intended.

**Suggested files.** `apps/expo/app/(app)/coach/sessions.tsx` (error vs
empty distinction), auth/session storage in `apps/expo/src/lib/`.

---

#### A17 · P3 — Smaller confirmed defects (bundle; fix in one sweep)

- **Month view selection ring mirrors today's day-of-month** in months
  without today (Priya: "Nov 26 ringed while today is Oct 26 — reads as
  'today' but isn't"). `apps/expo/app/(app)/calendar/index.tsx` month grid.
- **Pace double-rounding +1s/km** (Marcus W1: stored pace pre-rounded to
  2dp, `formatPace` rounds again — recompute from distance ÷ time).
- **Coach resets to empty on remount** with no continuation cue (Ash C1:
  "after switching dark→light I first thought my chat had been deleted") —
  restore last session or a "Continue last chat" chip.
  `apps/expo/app/(app)/coach/index.tsx`.
- **Proposal WHEN renders raw** `2026-11-03 · 07:00:00` (Jules + Ray:
  "Tue Nov 3, 07:00" please) and **two stacked WORKOUT headers with an
  orphan dot** (Ray). `ProposalModal.tsx`.
- **Suggested-reply chips cut mid-word with no scroll affordance** (Elin +
  Ray). Coach empty state.
- **Pending-proposals bar survives "New chat"** and reads as leftover chat
  state (Devon C2) — restyle as account-level, not chat-level.
- **Sign-in Enter doesn't submit; visible labels aren't associated with
  inputs** (Ada P7/F3 — `Field` in `apps/expo/src/components/ui.tsx`).
- **"via server" transport chip is developer jargon** (Sam F8 + Jules).
- **Email wraps mid-word; unexplained "Updated 22m ago"** in Settings
  (Ray). Copy batch with A15.

---

### (B) UX / visual improvements

---

#### B1 · P2 — Label the recorded-vs-planned hero pairing; give the week a verdict

**Evidence.** Maya (high): "Big number vs small flag number is *recorded vs
planned* — I decoded it from the data… nothing says so, and in week view the
big slots are literal '—' dashes so the card looks broken." Tom: "dash-first
made me parse it twice." Elin: "done-vs-planned bars read as a bug at 6am."
Ray (month view): "Which number in `40.8 / 93.5` is done and which is
planned is a guess." Counterpoint kept honest: Noor *likes* the week
summary once decoded — the fix is labeling, not redesign. Maya's wish: a
verdict line ("planned 53km · recorded 8km · on track").

**Acceptance criteria.** Week/month hero pairs are labeled (or rendered as
the month view's done/planned bar pair, per Jules' "steal that pattern");
a zero-actual week reads "no recordings yet", not "—". Add the goal-race
countdown chip here while in the file (see B2).

**Suggested files.** `apps/expo/app/(app)/calendar/HeroCard.tsx`, month
summary tiles in `calendar/index.tsx`.

---

#### B2 · P2 — Race anchors: countdown/phase chip + month-view titles

**Evidence.** Priya ([major] ×2, her #1 ask): "My A race is a gold dot on
'16'; nothing says *what* or *how many weeks*… No 'A race in 3 weeks', no
phase/taper chip, even though the event with RACE_A category is on the
calendar. The coach's brain has phases; the calendar never shows them."
Maya (med): "a countdown chip next to FORM would do." Noor confirms races
render well in week view; the gap is month-view anchors and header context.
(Also Noor's small note: race day sheet is sparse — no distance/target.)

**Acceptance criteria.** Calendar header shows, when a future RACE_A/B/C
event exists: "Goal 10K (A) · 21 days"; month cells render event titles
(not dots alone) at ≥768px width; race day sheet shows distance/target.

**Suggested files.** `apps/expo/app/(app)/calendar/index.tsx` (header +
month grid), `HeroCard.tsx` (countdown chip), `DayDetails.tsx`.

---

#### B3 · P2 — Make the coach's context visible (dataless / disconnected / grounded states)

**Evidence.** Sam (F3): a dataless athlete's first coach turn returns
confident invented-week advice and "no banner, no chip, no '0 activities in
context' indicator, so the user has no signal to distrust it." Noor: "if
the stack has no LLM key, say so in the chat instead of answering
confidently." Jules: "There is no visible signal distinguishing 'read your
data' from 'recited a script'… This needs a grounding check the *user* can
see." This is app-side (the mock's wording is §D2/C): surface the context
state in chat.

**Acceptance criteria.**
1. When events+activities+wellness == 0, the coach empty state and first
   turn show a dataless banner ("No training data yet — connect
   intervals.icu and I'll baseline you") and the suggested chips swap to
   onboarding prompts (Sam's chip note).
2. When the Worker returns `missing_openrouter_key`/502, chat says the
   coach is unavailable — never canned-sounding advice.
3. Each reply renders a compact context line ("based on: week of Oct 26 ·
   3 wellness days") so users can audit what the coach saw (Jules' ask;
   cheap version of Maya's "receipts").

**Suggested files.** `apps/expo/app/(app)/coach/index.tsx`, first-run
connect banner on calendar/coach empty states (Sam's single-element fix
for steps 3/4/6/8 of her round).

---

#### B4 · P2 — Don't auto-open the proposal modal mid-conversation

**Evidence.** Tom (med): the auto-opened modal "blocks the composer; Send
was dead until I dealt with it… the pressure-y pattern I dread." Ray: "the
sheet covered the coach's actual answer… One beat of delay (or an inline
card first) would keep the chat context." Ada confirms auto-open is by
design (`setModal(p)`); the inline card + pending banner already exist as
the calmer path.

**Acceptance criteria.** When the composer has text or the user is
mid-stream, a new proposal renders inline + banner only; auto-open yields
(respects typing) and never blocks Send. Setting or behavior test covers
both orders.

**Suggested file.** `apps/expo/app/(app)/coach/index.tsx` (`setModal`
paths ~:487/:527–530/:631/:647).

---

#### B5 · P3 — Bundle sheet: let the batch settle visibly

**Evidence.** Bo (CONFUSING 1, his "biggest single improvement"): "On full
success the sheet snaps shut instantly — the per-item `applied` chips are
only observable on partial failure. A ~1s '2 applied · 1 skipped' beat
before closing would show the multi-select actually mattering." Plus mobile
nits: "Approve selected (3)" wraps at 375px; header clause truncates
mid-word.

**Acceptance criteria.** Full-success apply keeps the sheet open ~1s with
per-row chips + a footer line, then closes; mobile 375px shows the button
label on one line (shorter copy: "Approve 2 of 3").

**Suggested file.** `apps/expo/src/components/ProposalBundleSheet.tsx`.

---

#### B6 · P3 — Post-apply confirmation and "inbox" recovery for proposals

**Evidence.** Jules (#2): "I approved… The modal closed and… nothing. No
confirmation, no toast, no 'view it on your calendar' link… I cannot tell
'applied' from 'failed' from 'wait for sync'." Maya (WISH): "a
pending-proposals 'inbox' with retry/dismiss per item would make the queue
banner a first-class rescue path." Tom: put WHEN + load on the inline
proposal card for triage. (Calendar reflection itself is mock-limited — §D2.)

**Acceptance criteria.** Approve closes with an explicit applied
confirmation + deep link to the affected date; each pending item in the
banner/queue can be opened, retried, or dismissed individually.

**Suggested files.** `ProposalModal.tsx`, coach pending-bar component,
`apps/expo/app/(app)/coach/index.tsx`.

---

#### B7 · P3 — Historian features: week-over-week trend + CTL/ATL curve + longer-reach honesty

**Evidence.** Noor: "I want to see the arc base → build → taper… This is
THE missing historian feature," and the CTL/ATL line "intervals.icu
already has." Also: when history is short, "the app should say how far back
the mirror reaches instead of an infinite wall of empty rest days." Tom's
LOW wish (week-over-week ramp % on the hero) folds in here, as does Noor's
note that the month "planned" total mixes past actuals with the current
week's plan.

**Acceptance criteria.** A trends surface (or month-view strip) plots
planned-vs-done km/load across ≥12 weeks and the CTL/ATL curve where
wellness rows exist; empty-range copy states the earliest mirrored date.

**Suggested files.** new stats surface under `apps/expo/app/(app)/`,
`packages/core/src/stats.ts` (rollups exist), month summary in
`calendar/index.tsx`.

---

#### B8 · P3 — Visual-polish sweep (one pass, low risk)

Ray's small-stuff list, Elin's card-slice, Ash's partial-marker — all
verified single-vote but cheap: THIS WEEK tile ragged baseline; Sunday row
ghosting behind the floating nav; month-grid planned/recorded markers too
dim in a dark room; floating summary card slicing text mid-glyph (add
fade/mask); "connection lost" marker on truncated reply bubbles (Ash W2);
sign-out-during-sync guard (Maya, low); model picker behind an "advanced"
disclosure (Jules); sign-in "New here? Create an account on intervals.icu
first" hint + remove/soften "Google — coming soon" (Sam + Maya); allow
typing while streaming (Devon W1). Calendar-month dead black fold (Ray).

---

### (C) Coach-quality items — hand to coach-tuner (with eval-log numbers per the working agreement)

---

#### C1 · P1 (coach) — Precompute goal math in the pipeline, not the model

**Evidence.** Kai (his #1, from the real-LLM round, grade A−): "The coach
quoted every digest-computed number verbatim and erred only on the two it
derived itself (goal VDOT, goal-distance equivalent — the most load-bearing
numbers of the whole conversation)." Drift observed: "around 43:20" vs
computed 43:44; "needs roughly VDOT 48.5" vs ≈49.0.

**Action.** Extend `vdotDigest` (`packages/core/src/digests.ts:193`) to
emit: exact anchor-race time (digest shows whole minutes — Kai's "21:00"
cosmetic drift comes from this), current 10K/HM equivalents, and — when a
goal race exists in the calendar digest — "goal X needs VDOT Y; you're at
Z". The prompt already instructs "quote these, do not re-sum."
**Accept:** eval fixture asserting the digest carries goal math and the
coach quotes it verbatim; `packages/core/tests/prompts.test.ts` updated.

---

#### C2 · P1 (coach) — Proposal-bundle consistency guard (volume and duration-vs-distance)

**Evidence.** Two independent sources. Kai (turn 2): bundle summary said
"volume cut ~20%" but its sessions total 38.5km vs the current week's 39km
(≈flat), prose claimed ~34km — "the one real methodology slip." Bo (live
real-LLM turn): "trimmed each run's distance ~33% but proposed **duration
increases** on two rows (run club `+6m · +13%`, steady `+5m · +12%`) — an
internally inconsistent 'cut'."

**Action.** At `validateProposal` time (worker + core validators), compute
each `propose_event` bundle's summed volume/duration delta vs the current
week and vs the model's stated rationale; on contradiction attach a warning
and surface it in the review sheet ("this bundle = 38.5km, +1% vs this week
— labeled as a down week"). Also feed dismissed proposals back as a one-line
system note so a re-design is explicit (Kai: turn 1's dismissed bundle was
silently superseded by turn 2's).
**Accept:** validator test with Kai's and Bo's exact contradictions;
warning renders in `ProposalBundleSheet`.

---

#### C3 · P2 (coach) — Eval asserting coach numbers == calendar numbers on the real path

**Evidence.** Ray (#6): "recommend a coach-tuner eval asserting coach
numbers == calendar numbers." Marcus (W2): "A single 'hero → coach'
consistency assertion in the QA harness… would have caught B1
automatically." (The canned-mock contradictions themselves — Marcus, Tom,
Noor, Jules, Ray, Maya, Sam, Priya — are harness artifacts and are
deliberately NOT filed as coach defects.)

**Action.** Add an eval scenario to `tools/eval_prompts.mjs` /
`packages/core/tests/prompts.test.ts`: parse the reply's numeric claims and
diff against `weeklyStats`/digest totals; any mismatch fails the eval.
Log results in `docs/research/eval-log.md`.

---

#### C4 · P2 (coach) — Decline-with-reason: constraints must be visibly weighed

**Evidence.** Tom (med): "When I ask for a Friday tempo inside a no-quality
window I want: 'Not yet — your physio cap has 3 more weeks; here's the easy
version + the date quality comes back'… Today neither the text nor the
proposal shows *why*." Jules makes it a delete-condition: the coach must
"visibly reflect the athlete (injury, actual week) — or visibly fail." Kai's
real-LLM round shows the model *can* do this (turn 4's HRV refusal is
"textbook") — this is an eval-coverage item as much as a prompt one.

**Action.** Add constraint-acknowledgment scenarios (injury cap, HRV trap,
taper) to the eval suite; require the reply to cite the constraint it is
honoring; verify proposals' rationale field references it.

---

#### C5 · P3 (coach) — History-replay capability, or an honest "I can't"

**Evidence.** Noor (#2, mock caveat noted): asked "what did I plan vs what
did I actually run? Which runs did I miss?" and got non-answers. The real
coach's digest covers current windows; define and eval a history question
("what happened in week X") — grounded answer or explicit can't — before a
historian persona is re-run.

---

### (D) QA-infra items (brief — for the Maintainer/tooling)

1. **`qa_stack.sh` lifecycle.** `stop_all` never kills the mock worker
   (`mock.pid` unread) → port 8099 squatting and `EADDRINUSE` deaths
   (Maya, Tom, Elin, Kai). `reset` dies on shared migration timestamp
   `1793045979` (alphabetical apply order breaks `chat_messages` →
   `chat_sessions`; Tom's rename fix). No PID lock / double-start guard
   (Kai). `start` never arms `QA_REAL_LLM_KEY` — restarts silently degrade
   to canned replies with no signal (Kai, Bo). Fix: read `mock.pid`,
   timestamped migrations, PID lock + health check, arm the real-LLM proxy
   from root `.env` in `start`.
2. **`qa_mock_worker.mjs` robustness (fixes landed mid-round — verify and
   keep).** Superuser/bearer auth on PB writes (Devon/Ada — landed);
   `JSON.parse` try/catch on batch bodies (Bo/Ada — landed). Still open:
   persona-aware replies derived from seeded `weeklyStats` (Maya, Tom W1,
   Devon W2), a dataless branch (Sam), `update_event`/`delete_event` kinds
   for cut/move phrasing (Devon), persist partial on client abort (Devon),
   mirror the Worker's `missing_intervals_key` shape (Sam), and an apply
   route that writes a `calendar_events` row so post-approve calendar
   reflection is testable (Priya).
3. **Concurrency isolation.** Shared PB + shared persona accounts caused
   mid-run wipes, cross-account chat pollution, and browser contention
   (Devon B3, Kai #3, Bo, Jules, Noor, Priya). Per-agent persona accounts
   (or per-agent stacks) + a reset lock.
4. **Seed fixes.** `emptystate` persona gets a `sync_state: ok` row and a
   fake athlete id, contradicting its premise (Sam F6); historian persona
   has only 2 weeks of history (Noor — seed a full build); strides seeded
   as category `WORKOUT` (Tom — feeds the A10 display issue).

---

## 3. "Would they keep it" table

| Persona | Verdict | One-line reason |
|---|---|---|
| Maya (marathon planner) | **Probation** | "The bones are right, and the fix list is short and specific" — but the approval loop failed 2-of-3, and that's the product's whole pitch. |
| Tom (comeback runner) | **Probation** | "The scaffolding respects me; the QA coach cannot prove it yet" — nothing in the app ramped him, but conservatism is unjudgeable on the mock. |
| Priya (racer) | **Probation** | Week-view race handling is the best she's seen; "fix the proposal handoff + month-view anchors and I'm in." |
| Marcus (data skeptic) | **Probation** | Trusts the deterministic surfaces "without reservation" (22/26 hand-checked); the coach quoting a week that doesn't exist is the trust kill. |
| Elin (mobile commuter) | **Keep** | "Yes, for the daily loop" — today's run front and center, fast coach, two-tap approvals; fix the day dead-end and degraded sheet. |
| Sam (empty state) | **Probation** | Mobile onboarding is genuinely good; desktop first paint hides the guidance and sync/coach both silently "succeed" with zero data. |
| Devon (power user) | **Probation** | "Reliable mechanics wearing a demo brain" — steering loop, sessions, and tool discipline held under stress; fix the stop-error leak, then prove the brain. |
| Ash (theme robustness) | **Keep** | Zero broken checks across 74: no theme leaks, zero overflow at 4 widths, exemplary failure/retry UX. |
| Ada (accessibility) | **Probation** | Coach and Settings fully keyboard-usable; the calendar is "no — not safely" until the InfoHint trap dies. |
| Kai (coach quality) | **Keep** | Real-model coach graded A−: grounded every turn, correct taper, textbook HRV caution; errors are pipeline-fixable. |
| Bo (bundle tester) | **Keep** | 38/38 checks pass on the bundle sheet — one review, shared reason, partial-failure retry, server-truth convergence. |
| Noor (historian) | **Probation** | Month view and week reconciliation are "the sentence I want every Monday" — but ghost MISSED "poisons the entire log" and weeks aren't linkable. |
| Jules (skeptical spouse) | **Probation** | His own label: "Keep — on probation"; flips to delete if the coach stays ungrounded-looking, approve stays silent, or strides stay labeled "Intervals". |
| Ray (night shift) | **Probation** | "The calendar earns its keep" at 3am — but the day-detail void and the 1.81:1 selected state break the tired-eyes loop he exists to test. |

**Tally: 4 keep · 10 probation · 0 delete.** The probation conditions
cluster almost entirely on five items: A1 (proposal handoff), A2 (ghost
MISSED), A3 (day route), A4 (keyboard trap), A8 (contrast token). Ship
those five and re-run the swarm; the coach-quality items (§C) gate the
second re-run with the real-LLM lane armed by default.
