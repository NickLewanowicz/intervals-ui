# QA — Ray "Night Shift" — 3am Tired-Eyes Round

- **Persona:** Ray — night-shift nurse, marathon build (sub-3:10 in 9 weeks, 45km/wk), checks training in stolen moments at 3am. Dark room, tired eyes, phone-brain. Judges glanceability and contrast; tiny grey-on-dark text is the enemy.
- **Account:** `qa-marathon@intervals.test` (seeded marathon persona — week of Oct 26: easy Mon, run-club intervals Tue, rest Wed, steady 10k Thu, rest Fri/Sat, long run 26k Sun).
- **Target:** QA stack only — web `http://127.0.0.1:8788`. Production never touched. No intervals.icu writes; the only writes were QA-stack coach chats + a proposal left **un-approved** (dismissing/closing only, matching steered-writes).
- **Method:** own headless Chromium process (isolated from the other agents' shared browsers), mobile **390×844 @2x, `prefers-color-scheme: dark`** (Ray's phone follows system dark), fresh context = true first login. Three passes: `driver.mjs` (sign-in → calendar → event sheet → month → status sheet → coach → settings), `probe2.mjs` (style census, sheet drag, proposal hunt, settings bottom), `probe3.mjs` (full day detail, coach history). Every surface also ran a WCAG-style contrast probe (effective bg walked up the tree; flags < 4.5:1 normal, < 3:1 large).
- **Raw:** `.scratch/swarm/ray/` — `driver.mjs`, `probe2.mjs`, `probe3.mjs`, `results.json`, `results2.json`, `results3.json`, `shots/`.
- **Registry:** 14 captures under agent `ray-ff` — `node tools/shot_registry.mjs index --agent ray-ff`, latest view `qa-screenshots/registry/latest/ray-ff/`.

**Zero console errors, zero page errors, all three passes.** Sign-in submit → calendar in **232ms**. Coach reply in **3.1s** (QA mock LLM). Every tap landed somewhere sane.

---

## Core question: can a half-asleep brain run this app?

**Mostly yes — the calendar earns its keep.** Today is circled before I find it myself, rest days wear a moon, PLANNED badges scan from across the room, and the bottom nav is thumb-sized. Sign-in and the coach chat are the right kind of big.

**But the round found two real bugs and one systematic contrast failure:**

1. **The full day-detail page is a black void** (`/calendar/day`). Tapping today's 6am run and then "Open full" gives me the title, "06:00 · Run", and then a full screen of nothing. No distance, no duration, no load, no description — even though the calendar row *behind* the sheet I came from shows `8.0km · 45m · ⚡30`. The peek sheet shows *less than the row it covers*, so "Open full" is mandatory, and then it delivers nothing. At 3am this is the difference between knowing what I'm doing at 6am and going back to bed.
2. **The Chats screen flashes light theme** — white background while Appearance = System and the system is dark. Opening coach history at 3am is a flashbang. Theme token leak on that route; everything else respects dark.
3. **The app's "selected" color pair fails contrast everywhere it's used.** Periwinkle `rgb(150,169,255)` on translucent indigo computes to **1.81:1** (needs 4.5) and shows up on: the 9px bold weekday letters in every day chip on the week strip (TUE–SUN — Monday's selected chip is fine, white on filled blue), the "1 pending proposal to review" banner, and the *selected* System/Kilometres chips in Settings. The most important state on screen is the hardest to read.

---

## Per-step verdicts (3am energy throughout)

### 1. Sign-in `/sign-in` — PASS, strong
- **LIKED:** One big blue thumb target, labels I don't have to hunt for, obviously-disabled Google row that doesn't beg to be tapped. 232ms to the calendar.
- **SQUINT:** ~450px of empty black above the card (harmless); "← Back" is small grey, but nobody signs out of this screen at 3am.
- Note: in earlier shared-browser sessions the QA creds appeared pre-filled; that was browser-profile autofill, not the app — code (`apps/expo/app/(auth)/sign-in.tsx`) has no prefill, and my clean-context run showed empty fields. Good.

### 2. Calendar, week view — PASS, the best screen in the app
> Today circled in the strip before I look for it; "Oct 26 – Nov 1"; Week/Month; THIS WEEK tiles; per-day rows with km · load.

- **LIKED:** Rest days say "Rest day" with a moon instead of an empty row — glances as *nothing to do*, not *broken*. PLANNED pills are unmissable. Day totals (`8.0km · 30`) on the right of every day header. Bottom nav pill: huge targets, active tab obvious.
- **SQUINT:**
  - Week-strip weekday letters (TUE…SUN) — 9px, 1.81:1 (see finding 3). Monday is the only day I can read at arm's length.
  - "synced 53m ago" and "THIS WEEK" are the grey-small pattern; legible but the first thing to go on a cheap OLED in the dark.
  - The four THIS WEEK tiles have a ragged baseline (DISTANCE/TIME values on one row, LOAD/FORM values dropping a line below their labels) — my eye has to zigzag.
  - Sunday's long-run row ghosts *through* the translucent floating nav pill — content bleeding behind chrome looks broken even when it isn't.
- Contrast census for the whole screen: the day-chip letters are the **only** failing style. Everything else passes 4.5:1. That's a genuinely good dark theme with one bad token.

### 3. Event tap → peek sheet — WEAK, then "Open full" → **BROKEN**
- The peek sheet (`day-sheet-peek`) shows date, "today" chip, "Open full", title, PLANNED, "06:00 · Run" — strictly less than the calendar row underneath it (which has km, duration, load). Dragging the grabber and wheeling inside it do nothing: it's a fixed peek. So the only path to detail is "Open full".
- The full page (`day-detail-full`, `/calendar/day?date=…`) is title + time + an entire screen of black. Scrolling changes nothing. **Distance/duration/load exist on the event and are already rendered on the calendar row — the detail page drops them.** No description, no workout steps, no pace targets.
- 3am verdict: two taps to learn nothing. This is the round's top gripe.

### 4. Month view — PASS with one squint
- **LIKED:** Planned ○ / recorded ● / race ● legend under the grid; selected day's events listed below the grid; THIS MONTH tiles attempt done-vs-planned (`40.8km` over `93.5km`).
- **SQUINT:** The grid markers are the tiny-dim pattern — planned hollow circles and recorded dots under day numbers are near-invisible in a dark room; the legend only helps once you've spotted one. Which number in `40.8 / 93.5` is done and which is planned is a guess without the tiny flag glyph. ~400px of dead black under the card wastes the fold.

### 5. Training-status tile → "Your training, right now" sheet — PASS, good 3am design
- **LIKED:** Opens with one plain-language paragraph — "You're at 0 of 275 planned load against a hold-flat of ≈307/wk… Form is -1 (neutral), steady." — then big numbers: THE GAP (307/wk vs 275, +32), CTL 42.0 / ATL 43.4, HRV 54.0 / RHR 51 / sleep 6h51m. Labels tiny-grey but values huge; the info ⓘ dots invite later reading. My recovery data, glanceable. The same sheet opens from every tile (fine — it *is* the training status).
- **SQUINT:** "the week sheds more than it loads" is coach-poetry; at 3am I want "you're 32 load under your maintenance". The +32 GAP sign convention (positive = shortfall) takes a beat to decode.

### 6. Coach — PASS on legibility, caveat on content
- Empty state: avatar, "Ask your coach anything.", example prompts, "Changes it proposes show up as approvals — you decide." Big, calm, readable. Suggestion chips bottom-mounted with the quiet "Educational — not medical advice." line.
- **LIKED:** Reply bubbles are white-on-dark, generous size — the most comfortable reading in the app. 3.1s to a full answer.
- **SQUINT:** The second chip is cut mid-word at the screen edge ("Build my plan for next w…") with no fade/hint beyond the cut.
- **Content mismatch (QA mock caveat):** asked "What should I adjust this week?" the mock replies "three easy runs, one interval session Tuesday, and the long run Saturday… 38km planned with a load of 142". My calendar says the long run is **Sunday**, 53.0km, load 275. Canned mock text, so this is *not* filed as a UI bug — but the numbers-vs-calendar agreement is exactly what `packages/core` prompts must guarantee on the real path; recommend a coach-tuner eval asserting coach numbers == calendar numbers (`docs/research/eval-log.md`).

### 7. Proposal flow — PASS on the promise, rough on the details
Asking "Move my Thursday run to Friday this week" produced a pending proposal and the sheet **auto-presented** over the chat.
- **LIKED:** Approve / Dismiss are huge, side-by-side, un-mis-tappable. The footer is the product promise in human words: *"You approve every change — not sure? Keep chatting to adjust it; nothing is written yet."* This modal is the soul of the app and it reads like it. The "1 pending proposal to review — tap to open" banner persists in chat — good recoverability.
- **SQUINT / gripes:**
  - `WHEN 2026-11-03 · 07:00:00` — raw seconds on a human decision. "Tue 3 Nov · 07:00" please.
  - Two "WORKOUT" headers stacked (one with "BY DISTANCE ≈ 5.0km" + a teal bar, one orphaned section with a lone dot bullet) — I stared at that middle chunk longer than at the actual change.
  - Auto-presenting mid-conversation startled me; the sheet covered the coach's actual answer. One beat of delay (or an inline card first) would keep the chat context.
  - The pending-proposal banner text is the 1.81:1 periwinkle-on-indigo pair (finding 3) — the app's most important notification is among its hardest text to read.
  - I closed it without approving (3am, not my decision to make half-asleep) — dismissing was obvious. The proposal was the QA mock's canned "Add Easy mock run" (content mismatch with my request is expected from the mock; flagged, not filed).

### 8. Settings — PASS
- **LIKED:** Keys are write-only with hold-the-eye peek; "Test connection" + "Sync status: ok · synced 53m ago" are right where the anxiety is; Sign out is a clear red outline; Appearance/Units segmented controls; athlete profile textarea says plainly it's "Given to the coach with every conversation" with a 77/4000 counter.
- **SQUINT:** The **selected** System/Kilometres chips are the 1.81:1 pair while the *unselected* options pass — inverted from every convention. Account email wraps mid-word (`qa-marathon@intervals.te` / `st`). "Updated 22m ago" under the account — updated *what*? Model roster (GLM 5.3 Flash DEFAULT / Claude Haiku 5.5 / DeepSeek V4.1 Flash) is fine and honest.

### 9. Coach history "Chats" — **THEME BUG**, list itself fine
- Renders **light** (white bg, dark text) while Appearance = System and the system is dark. Everything else in three passes respected dark. Route-scoped theme leak — worst possible screen to flash white at 3am.
- The list itself is clean: search, TODAY grouping, timestamps, per-row overflow ("Switch, rename, pin or delete"), New chat. No complaints beyond the flash.

---

## Ray's top gripes, ranked

1. **Full day detail shows nothing** (`/calendar/day`) — drops km/duration/load the calendar row already renders, no description/steps. Two taps to learn nothing about tonight's session. *(functional + glanceability, F-scale)*
2. **Chats screen ignores dark theme** — white flash in a dark room; route-scoped token leak. *(V-scale, but it hurts)*
3. **Selected-state color pair fails contrast (1.81:1)** — week-strip day chips, pending-proposal banner, selected Settings chips. One bad token, systemic. *(a11y — WCAG 1.4.3)*
4. **Month-grid planned/recorded markers are invisible** — tiny + dim; the legend explains marks you can't see. *(V)*
5. **Proposal modal details** — raw `07:00:00` timestamp, duplicate WORKOUT sections with an orphan dot, auto-present covering the coach's answer. The Approve/Dismiss core is right; the dressing needs a pass. *(V + minor F)*
6. **Coach reply groundedness must be asserted** — mock said Saturday/38km/142 against a Sunday/53km/275 calendar. Expected from the canned mock; add an eval that coach numbers == calendar numbers on the real path. *(coach-tuner)*
7. Small stuff: Sunday row ghosting behind the floating nav pill; ragged THIS WEEK tile baseline; chip cut mid-word at the screen edge; email wraps mid-word; unexplained "Updated 22m ago"; "sheds more than it loads" phrasing; month view's dead black fold.

## What worked at 3am energy

- **232ms sign-in → calendar**, zero squint on the way.
- **The week view is a real glance**: today, rest, planned, load — all before first coffee (there is no coffee, it's 3am).
- **The status sheet**: one human sentence, then big numbers — including my HRV/RHR/sleep. Best "tell me if I'm broken" surface in the app.
- **Chat legibility** — big white-on-dark bubbles; 3.1s answers; suggestion chips for thumb-brain.
- **The approval promise is loud and legible** exactly where it matters: "nothing is written yet."
- Zero console/page errors across three passes; every control I hit was thumb-sized and did the obvious thing.

## Notes for the maintainers

- Contrast numbers come from an in-page WCAG-style probe (`.scratch/swarm/ray/driver.mjs` `CONTRAST_FN`); effective-bg walk + per-element ratio, deduped by style. Raw flagged lists in `results*.json`.
- The pre-filled QA credentials seen in earlier shared-browser rounds are browser autofill from shared profiles, **not** an app behavior — clean-context runs show empty fields; no finding.
- One oddity in a shared-browser session (a "Wed 28" day sheet open immediately after sign-in) did **not** reproduce in three clean isolated passes — attributed to shared-browser contention, not filed.
- This round exercised only the happy path on a seeded account; empty/degraded states are Sam's round (`sam-empty-state.md`).
