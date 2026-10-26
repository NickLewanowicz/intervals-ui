# QA persona run — Priya, The Racer

- **Date:** 2026-10-26 · **Agent:** priya · **Build:** 92c936f (QA stack web export, 2026-10-26 16:29)
- **Stack:** local QA only — web http://127.0.0.1:8788, mock worker :8099, QA PocketBase :8090. Production never touched; zero writes to intervals.icu.
- **Account:** qa-racer@intervals.test (seeded: parkrun RACE_B 7d ago run+recorded, 6×800m/threshold/long run this week, "Goal 10K — sub-42" RACE_A in 3 weeks, wellness). Password not reproduced here.
- **Viewports:** 1280×800 desktop + 375×812 phone, dark color scheme. Driver: `.scratch/swarm/priya/driver.mjs`; 38 automated checks (24 pass) + 3 interactive reprobes; summary in `.scratch/swarm/priya/summary.json`.
- **Registry:** 27 captures → `qa-screenshots/registry/2026-10-26/92c936f/priya/` (surfaces referenced below as `d-*` / `m-*`).

## Step notes

1. **Sign-in** (`d-01`, `m-01`) — clean, no friction.
2. **Week view, race visibility** — RACE_B and RACE_A are both visible and clearly distinct from training days, on both widths. Parkrun week shows the planned event with a gold **RACE B** flag badge + gold card edge, and beneath it the recorded result card with a **RACE** badge, 4:13/km, HR 172 (`d-03`). A-race week shows "Goal 10K — sub-42" with a **RACE A** badge (`d-04`, `m-04`). This is the strongest race handling I've seen in this app — past races stay visible with their result, exactly what I want post-tune-up.
3. **Month view** — race days get a gold filled dot vs hollow planned dots, and the legend defines "race" (`d-05`, `d-06`, `m-05`). But cells are **dots only**: Nov 16 (my A race) reads as "16" + a dot — no title, no priority, no countdown (`d-06`). Verified programmatically: race dot rgb(224,164,88) ≠ training dot; cell text contains no event name.
4. **Day detail** — tapping the race day shows a proper **RACE A** flag badge + race name (`d-07`, `m-07`). Good.
5. **Coach: "I want to go sub-42 — is my plan on track?"** — reply arrived but was generic weekly advice with zero reference to my 10K, taper, or parkrun (`d-09`). Caveat: QA stack runs the canned mock LLM, so grounding can't be fully judged here — but the deterministic reply didn't use any of my race context even though it's on my calendar.
6. **Coach: "Schedule a tune-up 5k race next Saturday"** — proposal modal auto-opens (both widths). On the successful path the modal is genuinely reviewable: title, WHEN, NAME, CATEGORY, DISTANCE, DURATION, workout spec, "View workout text", rationale (`m-08`). On the failing path the modal is a **detail-less shell** — just "Add to calendar" + Approve/Dismiss (`d-10`), no name/date/spec/rationale.
7. **Approve** — **3 of 5 observed approvals failed silently**: the app POSTed `/api/proposals//apply` (**empty proposal id**) → 404; modal stayed open, no error shown anywhere 6–8s later (`d-11`, `probe-approve-error`); nothing written (QA PB: proposal stays pending, calendar unchanged). 2 of 5 approvals had a valid id and completed (modal closes, proposal → applied).
8. **Calendar after approve** — no new event appears on Nov 3 (`d-12`). Two causes, separated: (a) the failed approvals wrote nothing (client bug above); (b) even a *successful* approval writes nothing to the calendar because the **QA mock worker's apply route only flips proposal status** — the real worker writes to intervals.icu and refreshes the PB mirror (`apps/worker/src/index.ts:206`). Mock gap, not an app bug.
9. **Settings** — account card, intervals.icu connection (write-only API key + Test connection), AI coach model picker all fine (`d-14`, `m-11`). Athlete profile holds my goal as free text ("10K goal race (sub-42) in 3 weeks — A priority…") — no structured goal-event fields.
10. **Sign out** — clean exit to /sign-in on both widths.

*Env hazard (not an app finding):* another swarm agent reset the shared QA stack mid-run once (PB restart → CORS/refused errors in one desktop pass); affected pass was discarded and re-run. The findings below are stable across clean runs.

## LIKED

- **Races are first-class in week view** — gold RACE A/B/C flag badges, gold card edge, and past races remain visible *with their result* (pace/HR/load). Parkrun B-race vs goal A-race are instantly distinguishable. (major strength — `d-03`, `d-04`, `m-03`, `m-04`)
- **Month-view race dot is genuinely distinct** (gold filled vs hollow planned) + legend defines it. (`d-05`, `d-06`)
- **The full proposal card is exactly what I want to review**: WHEN/NAME/CATEGORY/DISTANCE/workout spec/rationale, "View workout text", plus the steering copy "You approve every change — not sure? Keep chatting to adjust it; nothing is written yet." and "Educational — not medical advice." (`m-08`)
- **"2 pending proposals to review — tap to open"** banner — nothing gets lost when I close a modal. (`m-08` top)
- Rest days explicitly labeled; week hero (Distance/Time/Load/Form) is good race-week framing. (`d-03`)

## CONFUSING

- **[major] Month view has no anchors.** My home screen shows dots only — no event titles even at 1280px. My A race is a gold dot on "16"; nothing says *what* or *how many weeks*. A racer cannot plan from this screen. (`d-06`; ref `apps/expo/app/(app)/calendar/index.tsx` month grid)
- **[major] No countdown / taper context anywhere.** Week header says "Nov 16–22" — that's it. No "A race in 3 weeks", no phase/taper chip, even though the event with RACE_A category is on the calendar. The coach's brain has phases; the calendar never shows them. (`d-04` header check)
- **[major] Settings renders LIGHT while calendar + coach render DARK** (system theme = dark). Looks like a different app. (`d-14`, `m-11` vs `d-02`; ref theme tokens in `settings/index.tsx`)
- **[minor] Coach empty state has no race affordance.** Chips are "What should I adjust this week? / Build my plan for next week / How's my fueling?" — no "Plan my race week" / "Add your A race", even though scheduling via chat works. (`d-08`)
- **[minor] Month-view selection ring lands on the same day-of-month as today** when the month doesn't contain today (Nov 26 ringed while today is Oct 26) — reads as "today" but isn't. (`d-06`)
- **[minor] Athlete ID input's accessibility label is "i167187"** — a hardcoded-looking id leaking as an a11y label. (`settings` probe; ref `settings/index.tsx`)

## BROKEN

- **[blocker] Approve intermittently no-ops silently.** 3/5 approvals POSTed `/api/proposals//apply` — **empty proposal id** → 404. Modal stays open, **no error message renders** (checked at 0.5s/1.5s/3s/6s/8s), nothing is written, no retry path. A racer who taps Approve believes their tune-up is scheduled. Evidence: `d-10`→`d-11`, `probe-approve-error`, network trace `POST http://127.0.0.1:8099/api/proposals//apply → 404`. Refs: modal proposal is built from the SSE event as `id: String(data.id ?? '')` (`apps/expo/src/lib/api.ts:145`); the error path exists (`ProposalModal.tsx:114,191`) but never rendered. The empty-id and detail-less modal below share one smell: **the modal is sometimes fed a stub proposal object (no id, no payload)** — likely the SSE proposal handoff vs pending-list reconciliation racing in the coach screen. Repro recipe: QA stack + mock worker, send a "Schedule…" message; ~60% of tries at 1280×800 in this session.
- **[blocker] Same stub path shows a detail-less approval modal** — "Add to calendar" + Approve/Dismiss only: no event name, date, distance, workout, or rationale (`d-10`, desktop). Even when approve *works*, 2 of my 5 reviews would have been blind if I'd tapped on this state. When the full object arrives, the modal is excellent (`m-08`) — so this is purely the handoff, not the modal design.
- **[QA-stack gap, not app] Mock worker apply never writes the calendar.** `tools/qa_mock_worker.mjs` apply route only PATCHes proposal status; the real worker applies to intervals.icu then refreshes the PB mirror (`apps/worker/src/index.ts:206`). Post-approve calendar reflection is untestable on the QA stack until the mock writes a `calendar_events` row.
- **[mock fidelity] Proposal content ignores the ask.** "Schedule a tune-up 5k race next Saturday" → canned "Easy mock run", category WORKOUT, Tuesday 2026-11-03 07:00 (asked for a Saturday race; expected at minimum a RACE_C category). Fine for plumbing QA, but race-flow QA needs the mock (or a real budgeted LLM) to propose races as races. (`m-08`)

## WISH

1. **Countdown + phase chip in the calendar header**: "Goal 10K (A) · 21 days · taper" — the data (RACE_A event + date) already exists. (my #1 ask)
2. **Race titles + priority in month-view cells**, not dots alone; keep past races gold forever.
3. **Structured goal events in Settings** (race, date, priority A/B/C, goal time) so calendar and coach share anchors — today the goal lives only as profile free text; plus an "Add race" flow from month view / coach empty state.
4. **Race context in proposals**: rationale lines like "placed 3 weeks before your A race"; and a hard rule that the modal can never render without payload/id (disable Approve + show the stub as an error instead).
5. **Coach replies that acknowledge the race** ("sub-42 needs ~4:12/km; your parkrun 4:13/km says it's live") — likely already in the production prompt; verify with the real-LLM budget path, and teach the QA mock to echo calendar context.

## Verdict — would a competitive racer trust this for race prep?

**Not yet — but the calendar half is close.** Week view treats races as first-class objects with A/B/C badges and post-race results, which clears my round-3 deal-breaker ("races invisible"). What holds me back: the month view I live in has no anchors, nothing in the UI counts down to my A race or says "taper", and — decisively — **the approve flow, this product's core promise, failed silently 3 of 5 times and twice showed me a modal with nothing in it to review**. A coach I can't reliably approve is a coach I stop trusting right before my taper. Fix the proposal handoff + month-view anchors and I'm in.

---
*Checks: 24/38 automated pass (failures = the findings above; several "FAIL" rows are the honest recording of the blocker). Captures: 27 registered via `tools/shot_registry.mjs` (agent priya, theme dark, platform web). Zero production calls; QA stack only.*
