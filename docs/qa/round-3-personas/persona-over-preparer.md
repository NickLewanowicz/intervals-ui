# Persona review — The Over-Preparer

> 30s-40s marathoner, multiple builds done. I train FOR FASTER than my goal and I expect my
> tools to hold me to it. I want honest weekly verdicts — am I hitting the plan, am I going too
> hard, am I at injury risk — with zero cheerleading. Reviewed from static screenshots,
> phone-width (375px) primary.

## Flow reactions

### 1. splash-hero — 👍 works
"Your training, coached" + "an AI coach that plans, and you approve every change" — that one
line tells me the division of labor I actually want. "80% easy. 20% fast." as the stated method
earns an instant point: a tool that leads with polarization is talking my language.

### 2. splash-scrolled — 👍 works
Citing Fitzgerald/Johnson and Fitzgerald/Rosario as the sources, then "distilled into principles,
not passages" — that's the right posture for someone who's read both books. The three-step
how-it-works (connect → chat → approve) sets the exact expectation I have: it proposes, I decide.

### 3. splash-footer — 👍 works
"not medical or professional advice… see a professional, not a plan tweak" — honest and it
doesn't waste my time. No marketing fluff anywhere on this page; nothing I'd skip because it
insulted me.

### 4. sign-in — 🤨 doubt
Email + password + a disabled "Google — coming soon". Fine, but there's no create-account path
visible and no forgot-password. If "Get started" just lands here too, I don't know how I'd
actually provision an account for the training log I'm about to trust.

### 5. calendar-week-current — 👍 works
This summary card is the core of my weekly verdict and it's *almost* there: DISTANCE 8.1km →
30.3km, TIME 2h44m → 2h43m, LOAD 137 → 277, planned vs actual, week of Oct 19. LOAD actual
running at 2x planned is exactly the "am I going too hard" signal I want surfaced — but the app
just states the numbers and stays silent. Give me the verdict line ("actual load 2x planned —
intentional?") in the card itself, not buried in a chat I have to open.

### 6. calendar-week-current-scrolled — 🤨 doubt
Sat 24 (today) is highlighted with the planned "Aerobic maintenance 50m · load 46" above actual
"Morning Run 8.4km · 2:56/km · load 70". Two problems for a precision read: (a) today sits below
three rest days — I want today pinned at top of week view, not found by scrolling; (b) 2:56/km
average at 145bpm is displayed deadpan — if my watch fed me that, I'd want the tool to flag it,
because I audit these numbers.

### 7. calendar-week-next — 👍 works
Next week loads with planned-only values (49.9km, 297 load, longest run dash) and the stride
sessions are named properly ("Easy aerobic + strides", run club with Z3 rep scheme). Sensible
week shape: 297 load on a ~50km week reads like a real post-marathon bridge, not a template.

### 8. calendar-month — 🤨 doubt
Month totals: 126.7km planned → 105.0km actual, but LOAD 849 planned → 927 actual. I can
construct a story (shorter but harder recovery runs), but the card makes no attempt to explain
the divergence — and a month grid of dots with zero labels means I can't see the marathon block
shape, the cut week, or anything about structure at a glance. The month view tells me nothing I
couldn't get by paging through weeks.

### 9. day-detail — 🤨 doubt
The session parse is genuinely good: WARMUP / MAIN SET ×10 / MAIN SET ×5 / COOLDOWN with
per-step zones and colors — that's intervals.icu-grade structure. But below it the raw
description block repeats the identical content in monospace. Redundancy on every workout card
is noise, and the "BY TIME ≈ 2.0km · 32m" label is unexplained — 2.0km of what? 32 minutes of
what? If that's "quality volume," say so.

### 10. day-detail-scrolled — 🤨 doubt
RECORDED with a zone-time bar (SS/Z1–Z7) is the right rigor — this looks like intervals.icu, and
the COROS source on the afternoon run is a good touch. But the zone times (7+11+2+7+9+6+8+2 =
52m) don't reconcile with the 48m duration shown in the same card. Small, but *this* is the kind
of thing that decides whether I trust every other number.

### 11. coach-empty — 👍 works
"The coach sees your calendar, recent activities and fatigue. Changes it proposes show up as
approvals — you decide." Correct contract, restated where it matters. Example prompts are
capability-shaped, not cheerful.

### 12. coach-conversation — 🤨 doubt
Substance is excellent: per-session loads that match the calendar (38/52/44), reps capped at Z3
"because of the HRV dip below 55", fueling rehearsal on the long run. This coach knows my week.
But it ships raw markdown — "**Mon**:" with literal asterisks — in the headline coaching
surface. Sloppy rendering makes a rigorous answer look like a demo.

### 13. coach-streaming-reply — 👍 works
"Planned total: ~50km… a modest step up from recovery week, within ramp limits. Structure is
80/20-compliant: only Tuesday touches Z3" plus Watch items with actual HRV numbers (46–48
mid-week, 61 Saturday) and fatigue (43 on Sat) — this is precisely the honest weekly verdict I
priced in. Two gripes: "~340 load" contradicts its own itemized loads (which sum to 297, same as
the calendar), and I can't see HRV/fatigue anywhere in the app itself to check its claims.

### 14. proposal-modal — 🤨 doubt
"You approve every change — this is a proposal, not a write" + rationale ("quality sits on a
fresh day, not stacked on Tuesday's run club") + "keep chatting to adjust — nothing is written
yet" is exactly the control model I want. But the title says "Delete calendar entry" while the
rationale describes a swap — the add half is a *second* modal I haven't seen yet. One logical
change should be one approval.

### 15. proposal-modal-timeline — 🤨 doubt
Full workout spec with "Gate on readiness: HRV ≥55 and no leg heaviness — otherwise keep the
original easy run" — conditional execution is a pro feature; the coach is thinking like a
planner. But "EVENT #147702969" leaks a database ID, and "Update calendar entry" shows no
before-state — I'm approving a diff I can't see. What exactly is being replaced?

### 16. settings-account — 👍 works
Athlete ID + API key with write-only masking, "Test connection", sync status inline — clean and
honest. BYO OpenRouter key with "the app never sees the key the worker uses" — I understand the
architecture in one line. Good.

### 17. settings-ai-model-picker — 🤨 doubt
"Athlete profile (given to the coach)" is THE most important field in this app for me — race,
goal time, constraints, non-negotiables — and it's a cramped textarea clipped mid-sentence
("am I hitting the plan, am I…"). If this is the system prompt, give it room and structure. Model
picker with a DEFAULT badge is fine; three flash-tier models though — for planning quality I'd
at least want the option of a frontier model on long-run build decisions.

### 18. settings-preferences — 🤨 doubt
Appearance + km/mi is fine. But Save changes is a single button at the very bottom: I edit my
athlete profile at the top, and the save affordance is off-screen. There's no dirty-state hint
and no confirmation state visible. Silent data loss risk on the field I care about most.

### 19. signed-out — 👍 works
Clean return to sign-in, state fully cleared. No complaints.

## Specialty: would this hold me honest?
Partially — and the missing half is specific:
- The *verdict* exists but only in chat ("within ramp limits", "80/20-compliant"). The calendar
  summary card — the thing I see daily — shows raw arrows and no judgment. I want the verdict
  where the numbers live.
- Honesty signals I'd check weekly are missing: no CTL/ATL/TSB or fitness trend anywhere, no
  adherence % (sessions hit vs planned), no ramp-rate number. The coach references these
  concepts, but I can't audit them.
- No goal race / goal time anywhere in the UI. My whole model is "train for faster than the
  goal" — where does my goal pace live? How do I know long-run pace prescriptions relate to it?
- The app never tells me when I beat or missed the plan. "8.8km actual vs 8.1km planned, load 92
  vs 50" should generate a one-line flag. Instead I audit by eye.

## Top 5 asks (prioritized)
1. **Weekly verdict line in the calendar summary card** — one sentence generated from
   planned-vs-actual ("Load at 2x plan mid-week — check Tuesday doubles") with a link to the
   coach thread behind it.
2. **Structured goal-race block in the athlete profile** — race date, distance, goal time as
   fields (not free text), surfaced as a countdown chip in week view; the profile textarea
   itself needs to be full-height, not a clipped 4-row box.
3. **Fix trust bugs**: render markdown in coach replies, reconcile zone-time sums with session
   duration, make "~340 load" totals consistent with itemized loads, kill the raw entry ID in
   proposal titles.
4. **Show the plan-quality numbers**: fitness/fatigue/form trend (CTL/ATL/TSB or equivalent) and
   weekly adherence % on the calendar or a stats strip — the coach cites HRV/fatigue that the UI
   never shows.
5. **Merge a swap into one proposal** — one modal, before/after diff (old session vs new
   session), single Approve.
