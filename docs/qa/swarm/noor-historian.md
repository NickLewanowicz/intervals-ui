# Noor — the historian — QA findings

Persona: runner who lives in the past. I review old weeks relentlessly, compare
build phases, and check planned vs done. Marathon in ~9 weeks (Goal Marathon,
Dec 25, RACE A — found it). Account: qa-marathon@intervals.test.
Tested web at 127.0.0.1:8788, own headless Chromium (1280×800), 2026-10-26 ~21:40–22:00.
Screenshots: `qa-screenshots/registry/.../noor-ff/` (surfaces listed at the bottom).

## What I tried (in order)

1. Signed in from the landing page (email + password). Landed on /calendar, current week.
2. Walked backward with Previous, week by week, 22 clicks deep (to May 25–31), reading
   every week's summary and day cards via DOM text.
3. Opened last Monday's DONE long run → day side sheet → "Open full" day page.
4. Month view: October, then walked forward Nov → Feb hunting my race.
5. Coach tab: asked three history questions + one new-chat sanity check; opened chat
   history; opened the seeded proposal chat.
6. "Your training, right now" status sheet from the week header chips; About Load popover.
7. Settings (account, intervals.icu connection, BYO keys, athlete profile, preferences);
   switched theme to Dark; reloaded to check persistence.
8. Odd stuff: keyboard arrows on the calendar, reload mid-history, opening the app in a
   second tab while signed in.

## What worked — genuinely nice for a history nerd

- **Week summary does planned-vs-done properly.** Big number = done, small flag =
  planned, for Distance / Time / Load, plus Form. Last week reads "32.0km vs 32.0km,
  load 148 vs 148" — that's the sentence I want every Monday.
  (`calendar-week-oct26`, `f2-week-oct19-header`)
- **Month view is my favorite screen.** Day pips with a legend (○ planned, ● recorded,
  ● race), month-level done-vs-planned summary on top. October reads like a story:
  empty first weeks, then the Oct 12/19/20 dots. (`month-view-oct`)
- **The race is first-class.** Dec 25 shows an orange race pip in month view; race week
  renders "Goal Marathon / RACE A / 42.2km / 3h05m / load 320". Nine weeks out, my
  target is one glance away. (`month-view-dec-race`, `week-race-dec21`)
- **DONE cards carry real activity data** — pace 4:49/km, HR 148, load 118, and the day
  sheet splits the run into a Z1/Z2 bar. The day side sheet groups the planned slot and
  the recorded run together. (`day-sheet-mon19`, `day-full-oct19`)
- **"Your training, right now" sheet** speaks my language: hold-flat ≈307/wk, me 275,
  THE GAP, CTL 42.0 / ATL 43.4, 7-day HRV/RHR/sleep, plus a plain-language sentence.
  (`training-status-sheet`)
- **Days are deep-linkable** — "Open full" goes to `/calendar/day?date=2026-10-19`.
- **Chat history panel** lists conversations titled by first message, with
  rename/pin/delete affordances; my chats persisted. (`coach-chat-history-panel`)
- **Dark mode is clean** and survives reload. (`calendar-past-week-dark`)
- About Load popover explains TRIMP in one line. Good tone everywhere:
  "Educational — not medical advice" without nagging.

## What didn't work — bugs and broken promises

1. **Ghost MISSED duplicates (worst finding).** Every recorded run ALSO shows the
   planned event as MISSED. Monday Oct 19 renders as "2 runs · 48.1km · load 236" —
   but I ran ONCE (24.1km). The planned 24.0km MISSED card sits right above my actual
   DONE card. Same on Tuesday (8.0 MISSED + 7.9 DONE = "15.9km"). Day chips sum
   planned+actual, so the day headers disagree with the week summary (48.1+15.9 = 64km
   of "runs" in a week the header calls 32.0km done). My best long run of the block
   wears a red MISSED badge. For a historian this poisons the entire log.
   (`f2-week-oct19-header`)
2. **The coach cannot replay history — and confidently makes things up.** I asked
   "looking back at the last two weeks, what did I plan vs what did I actually run?
   Which runs did I miss?" → "Here's your week: three easy runs, one interval session
   Tuesday, and the long run Saturday. You're at 38km planned with a load of 142…"
   Nothing in my calendar matches 38km/142/Saturday-long-run (my week is 53km/275 with
   the long run Sunday). Two follow-up questions got the identical response
   word-for-word; a fresh chat got a different canned line, also non-answers. The QA
   stack coach is serving fallback text, not my data. If a real athlete got numbers
   this wrong they'd delete the app; if the stack has no LLM key, say so in the chat
   instead of answering confidently. (`coach-history-canned-answer`)
3. **History is 2 weeks deep.** Everything before Oct 12 is empty — Sep, Aug, Jul…
   all "No events in this window" (and the banner shows even while 7 rest-day cards
   render). Nine weeks out from a marathon I want my base phase; there's nothing to
   compare this build against. QA seeding gap, but the app should also say how far
   back the mirror reaches instead of an infinite wall of empty rest days.
4. **Weeks have no URL / no memory.** Walking back 2 weeks keeps URL `/calendar`; a
   reload snaps to the current week. Days got deep links; weeks didn't. I cannot
   bookmark, share, or refresh "the week I was reviewing". Keyboard ←/→ don't
   navigate weeks either (tested, nothing happens). For someone who lives in
   week-view this is a daily friction.
5. **The status sheet is date-blind.** Opened from race week (Dec 21–27) it says
   "You're at 0 of 275 planned load…" — that's THIS week (Oct 26) wearing no label.
   It should name the week it describes. Also THE GAP shows "+32" while I'm *below*
   hold-flat (275 vs 307) — the sign reads backwards unless you decode it as "load
   still to add". (`training-status-sheet`)
6. Small stuff: race day sheet is sparse (no distance/target shown for the race,
   unlike recorded runs); month summary mixes past actuals with the current week's
   plan (October "planned 93.5km" includes this week's 53); huge empty whitespace in
   the full-day page and coach page at desktop width; sign-in button ignored
   programmatic clicks twice during setup (real users click fine, automation didn't —
   possible transition/actionability quirk).

## Odd things I tried, for completeness

- Second browser tab while signed in: the new tab is signed OUT (session appears to be
  per-tab). Surprising for a training app; my phone-later-laptop flow would not expect it.
- Theme toggle → reload: persists. Units toggle: left on km (I'm European, no test).
- "Sync now" and intervals.icu "Test connection" not exercised (kept the QA stack
  untouched beyond reads/chat).

## Wishlist (what's missing for ME)

- A **week-over-week trend**: bars or a line of planned vs done km/load across the
  whole build. Month pips are a start; I want to see the arc base → build → taper and
  compare builds. This is THE missing historian feature.
- A **CTL/ATL curve** over time. The numbers exist in the status sheet; give me the
  line intervals.icu already has.
- **Planned→actual reconciliation at the event level**: "24.0 planned → 24.1 done ✓"
  instead of ghost MISSED badges (fix #1 above).
- Week deep links + keyboard navigation.
- A coach that answers "what happened in week X" from my history — or honestly says it can't.

## My priority order for fixes

1. Ghost MISSED/double-counted day chips (data honesty; blocks all history use).
2. Coach grounding (or explicit "no model key / can't see history" state).
3. Week deep-linking + selected-week persistence + arrow keys.
4. Status sheet week label + GAP sign.
5. Longer seeded history so flows like mine can be tested at all.

## Environment notes for the swarm

- Shared Playwright MCP browser was contended between concurrent agents (my calendar
  got navigated away mid-flow twice, once while signed in as a different persona).
  Per coordination I moved to my own chromium process via
  `.scratch/swarm/noor/lib.mjs` + `flow-*.mjs` scripts — clean and reproducible; the
  texts/ dumps in `.scratch/swarm/noor/texts/` contain every week I walked.
- The ZCode in-app browser screenshot surface timed out consistently this session
  ("surface preparation timed out after 3000ms") — DOM automation worked; capture didn't.

## Screenshots registered (noor-ff)

calendar-week-current, calendar-week-oct26, calendar-week-may25-empty,
f2-week-oct19-header, day-sheet-mon19, month-view-oct, month-view-dec-race,
week-race-dec21, about-load-popover, coach-history-canned-answer,
coach-chat-history-panel, coach-seeded-proposal-chat, settings-page, day-full-oct19,
race-day-sheet, training-status-sheet, calendar-past-week-dark.
