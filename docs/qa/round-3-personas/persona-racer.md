# Persona review — The Racer

> 30s, 10-15 races/year, 5K→marathon, clear A/B/C priorities. I think in countdowns: "6 weeks
> to my A race, 2-week taper." Races are anchors; everything between them is a plan segment. I
> live in the calendar and judge apps on race-handling: A-race highlighting, taper visuals,
> prep-week logic, post-race recovery. (Context I reviewed against: this athlete ran a marathon
> Oct 11.) Reviewed from static screenshots, phone-width (375px) primary.

## Flow reactions

### 1. splash-hero — 👍 works
"Plan my race week" isn't on the hero, but "AI coach that plans" + approve-every-change reads
like it could handle a race-centric plan. Cautiously interested.

### 2. splash-scrolled — 👍 works
Sources are marathon-lit standard. No race features promised explicitly, none denied. Neutral.

### 3. splash-footer — 👍 works
Fine. Skip.

### 4. sign-in — 👍 works
Clean. (Where do I *declare* my A race though? A race-centric tool should ask during onboarding
— "what are you training for?" — and nothing in the sign-in flow hints at that.)

### 5. calendar-week-current — 🤨 doubt
Week of Oct 19 is post-marathon recovery (lots of rest days, modest loads) but NOTHING on this
screen says that. No "recovery week" label, no phase chip, no "2 weeks since your marathon"
context. I have to *infer* the plan phase from load numbers. TrainingPeaks would at least badge
the race week I'm recovering from.

### 6. calendar-week-current-scrolled — 👍 works
"Aerobic maintenance" and "Recovery jog" naming is phase-appropriate, and the "today" pill +
blue highlight is exactly how today should look. Good bones — but it's still a calendar of
runs, not a calendar *around a race*.

### 7. calendar-week-next — 🤨 doubt
First week "of bridge into the Winterlude block" (that phrase only appears later in coach chat
— see step 12). Strides reintroduced Tuesday, long run Sunday — fine sequencing. But from the
calendar alone there's no answer to "bridge to WHAT, by WHEN?" If there's a block name and an
end goal in the coach's head, the calendar should show it in the week header.

### 8. calendar-month — ✋ blocker
This is the screen I live in and it's the weakest for me. Dots only — no event titles even at
1280px desktop. The legend has a gold "race" dot, but October's marathon on Oct 11 shows only
planned/recorded dots — the biggest race of this athlete's year is visually indistinguishable
from a Tuesday jog. No race marker, no A/B/C priority, no countdown ("3 weeks to..."), no
taper shading, nothing. For someone whose mental model is "races are anchors," this month view
has no anchors at all.

### 9. day-detail — 🤨 doubt
Session structure rendering is legitimately good (zone-colored warmup/main/cooldown with per-rep
zones). If a coach proposed my Tuesday session like this I'd be happy. But there's no way to
see from here whether this session *belongs to a block* or serves a race.

### 10. day-detail-scrolled — 👍 works
Recorded zone breakdown per activity, COROS attribution — good post-race/recon data hygiene.
Nothing race-specific to judge here.

### 11. coach-empty — 🤨 doubt
"Plan my race week" is the first example prompt — so race planning is officially in scope. But
the empty state offers no race setup path ("Add your A race" button would be natural here).
The capability is implied, the workflow isn't visible.

### 12. coach-conversation — 👍 works
"first week of bridge into the Winterlude block" — the coach HAS a block model with a name and
a direction. "fueling rehearsal (syrup + salt flask from 60min on)" on the long run is exactly
race-prep thinking, not a generic long run. This is the first screen that feels built by
someone who trains for events. Now surface that block/phase language in the calendar!

### 13. coach-streaming-reply — 👍 works
"within ramp limits… 80/20-compliant: only Tuesday touches Z3" + concrete watch items. A coach
that states the plan's structure and constraints in one breath is a coach I could steer a race
build with — via chat. My whole complaint remains: the chat knows the plan; the calendar
doesn't show it.

### 14. proposal-modal — 🤨 doubt
"Swapping the Thursday easy run for the requested Z4 tempo so quality sits on a fresh day" —
the reasoning is race-prep-literate (fresh-day quality). But one swap = two modals
("Delete calendar entry" + some update I haven't seen), and race-window context ("this is 3
weeks before X") is absent from the rationale. When I'm placing sessions relative to a race,
the proposal needs to show me the race context.

### 15. proposal-modal-timeline — 👍 works
WHEN 2026-10-29 · 18:00, full workout spec (3×2km Z4 cruise intervals with HRV gate), rationale,
approve/dismiss — as a session card this is genuinely reviewable. "#147702969" in the event
title is sloppiness, and again no before/after and no race-context marker. Placement logic
(Thursday quality between Tuesday club and Sunday long run) is sound.

### 16. settings-account — 👍 works
Connection handling is solid. No race/goal fields here — that's a settings-design miss, not a
bug.

### 17. settings-ai-model-picker — 🤨 doubt
The athlete profile mentions "Primary goal: hands-off marathon/HM build planning" — so goals
live here as free text. A racer needs structured goal events (race, date, priority A/B/C, goal
time) that both the coach AND the calendar can read. Free-text goals explain why races are
invisible in the calendar.

### 18. settings-preferences — 👍 works
Theme + units, fine. Save-at-bottom quirk noted but whatever.

### 19. signed-out — 👍 works
Clean exit.

## Specialty: race visibility & race-prep logic
- **Races are invisible.** The month legend defines a gold "race" dot, and the athlete ran a
  marathon on Oct 11, and it isn't shown as one (or the tag isn't applied). No A/B/C priority
  anywhere. This is my #1 deal-breaker and it's fixable presentation-layer.
- **Countdown/phase exists in the brain, not the UI.** "Bridge into the Winterlude block",
  "recovery week", "closes the recovery week" — the coach models phases. The calendar header
  shows "Oct 19 – Oct 25" and nothing else. One chip ("Recovery W2 → Bridge to Winterlude") in
  the week header would connect the two halves of the product.
- **Race-prep thinking is real where it counts**: fueling rehearsal on the long run, capped Z3
  reps during an HRV dip, fresh-day quality placement, 80/20 compliance. The coaching content
  would pass a FinalSurge/TrainingPeaks refugee's sniff test — the *container* wouldn't yet.
- **"I registered for a race on Nov 8" friction**: today, that's a chat sentence → hopefully a
  proposal → probably manual calendar knowledge. There's no "add race" affordance anywhere —
  not on month view, not in coach empty state, not in settings. That conversation should end
  with a race on my calendar, highlighted, with the block reorganized around it.

## Top 5 asks (prioritized)
1. **Race events as first-class calendar objects**: gold marker + title in week and month views,
   A/B/C priority ring, past races still visible (Oct 11 marathon should glow).
2. **Phase/countdown chip in the calendar header** — "Recovery W2 · Bridge to Winterlude ·
   [next race] in 5 wks" — the coach already knows this; render it.
3. **"Add race" flow**: from month view and coach empty state; race + date + priority + goal
   time; coach proposes a block reorganization as proposals (it's 80% built — proposals already
   exist).
4. **Race context in proposals**: rationale lines like "placed 3 weeks before your A race" and
   no raw IDs; single-swap approvals with before/after.
5. **Structured goal events in the athlete profile** (not free text), so "Plan my race week"
   has data to act on and the calendar has anchors to render.
