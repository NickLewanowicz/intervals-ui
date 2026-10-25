# Persona review — The Comeback Runner

> Late 30s, back from a soleus injury that ate a marathon block. Rebuilding walk/run → base →
> strides → quality under a physio protocol (calf raises, "≤4/10 discomfort OK, must not be
> worse next day"). I am hyper-aware of load spikes and ramp rates; my biggest fear is an app
> that cheerfully ramps me into re-injury, my second-biggest is one that treats me like glass.
> Reviewed from static screenshots, phone-width (375px) primary.

## Flow reactions

### 1. splash-hero — 👍 works
"an AI coach that plans, and you approve every change" — approval-first is the right posture for
someone who doesn't hand over the reins. "80% easy" as the headline method is reassuring: this
thing is biased toward easy volume, which is what a comeback is made of.

### 2. splash-scrolled — 👍 works
Nothing risky here. The sources and "shows its work" framing suggest the coach explains itself
— that matters to me because I need to sanity-check every progression against my leg, not
against a spreadsheet.

### 3. splash-footer — 👍 works
"If something hurts, see a professional, not a plan tweak" — the app literally telling me it
knows its lane. That one sentence buys real trust.

### 4. sign-in — 👍 works
Simple. Nothing to react to.

### 5. calendar-week-current — 🤨 doubt
Rest days are clearly labeled (Wed, Fri) and each session carries a load number — load
visibility per day is the foundation I need. But the summary card shows LOAD 137 → 277 (actual
running 2x planned mid-week) with no comment. That arrow is exactly the shape of a ramp that
bites me: nothing flags whether 2x is a problem, a race week, or noise. Show me the week's ramp
rate, or a green/yellow/red on that card.

### 6. calendar-week-current-scrolled — 🤨 doubt
Today (Sat 24): planned "Aerobic maintenance 50m · load 46" vs actual 8.4km at 2:56/km, load 70.
If that were my comeback week, an "easy" session outrunning its plan by that much (load 46 →
70) should get a nudge — "that was faster than easy, tomorrow stays flat." The planned session
name "Aerobic maintenance" is good language though: it says *easy is the point*.

### 7. calendar-week-next — 👍 works
This is a week I'd accept from my physio: easy aerobic + strides, club run, rest Wednesday,
recovery jog Friday. No double-quality days, rest day mid-week, loads 38–52. Strides as the
only sharp stimulus is textbook return-to-quality sequencing. I'd want a sentence saying
"step-up from last week: +X%" to fully trust it.

### 8. calendar-month — 🤨 doubt
The dots tell me *when* I ran but nothing about *how hard the block is trending*. For a
comeback the month view should be a load trend I can eyeball (bars, or planned-vs-actual per
week) — instead it's presence-only dots. Also nothing marks the marathon on Oct 11; I can't see
"post-race recovery period" as a shape. My comeback is a *story over weeks*; this view doesn't
tell it.

### 9. day-detail — 👍 works
Warmup/main-set/cooldown with zone colors and per-rep structure, "walk 30s" reps kept in the
main set — the app handles run/walk structured sessions natively, which is literally where I
live right now. Respect.

### 10. day-detail-scrolled — 🤨 doubt
RECORDED with time-in-zone bars is good — I can see at a glance a session was Z3-heavy when it
was planned Z1-Z2. What's missing: any soreness/discomfort note field. I log "calf 2/10, next
day fine" in my descriptions; there's no obvious place for it in the UI itself (the raw
description block would hold it, but nothing invites or surfaces it).

### 11. coach-empty — 👍 works
"Build me back after 2 weeks off" is one of the three example prompts. Someone on this team has
been injured. "The coach sees your… fatigue" + approvals-only changes is the contract I need
before I let it near my calendar.

### 12. coach-conversation — 🤨 doubt
This is the safety behavior I've been looking for: "reps capped at Z3 **because of the HRV dip
below 55**" and "Fri: rest day instead if HRV flags red again or legs are heavy." The coach is
*pre-emptively* de-fanging a session in response to a wellness signal, and it plans the
fallback. That's not treating me like glass — Tuesday quality still happens, just capped. My
doubt: the HRV numbers it's acting on are invisible to me in the app. I can't see my own dip.

### 13. coach-streaming-reply — 👍 works
"~50km, a modest step up from recovery week, **within ramp limits**" + explicit Watch items
(HRV 46–48 mid-week → 61 Saturday, fatigue ticking to 43) — this is load management narrated
like a good physio would. If the calendar had a matching HRV/ramp indicator this would be a
full thumbs up. (And again: asterisks showing in "**Watch items:**" — polish matters when you
play a medical-adjacent role.)

### 14. proposal-modal — 🤨 doubt
The proposal-not-write model with rationale and "keep chatting to adjust — nothing is written
yet" is exactly the guardrail I want. But "Delete calendar entry" as the title for what's really
a swap, split across two proposals, is risky for me specifically: if I mis-approve a delete and
miss the second modal, my Thursday session vanishes. Deletions should be louder; pairs should
be one operation.

### 15. proposal-modal-timeline — 🤨 doubt
"Gate on readiness: **HRV ≥55 and no leg heaviness — otherwise keep the original easy run + strides**"
is the single best safety feature in the whole flow: conditional execution with a conservative
fallback. I would approve that. But the title "Update calendar entry" hides what's being updated
— for all the modal shows, it might be overwriting my physio notes in the description. Show me
the before-state so I can confirm my constraints survive the edit.

### 16. settings-account — 👍 works
Connection status honest and visible ("synced 1h ago"). Nothing to fear.

### 17. settings-ai-model-picker — 🤨 doubt
The athlete profile — labeled "(given to the coach)" — is where my physio protocol MUST live
("soleus, ≤4/10 OK, no back-to-back quality, calf raises daily"). It's a cramped text box
clipped mid-sentence. If the coach is gated on constraints, the constraints field should be a
first-class, roomy, structured thing — not a 4-line textarea I have to scroll inside.

### 18. settings-preferences — 🤨 doubt
Save-at-bottom risk again: I paste my physio protocol into the profile, don't scroll, close the
app, my constraints are gone — and I only find out when the coach ramps me like they were never
there. That's my nightmare scenario via a missing save bar. Autosave this field specifically.

### 19. signed-out — 👍 works
Clean sign-out. Fine.

## Specialty: load, risk, and constraint handling
**Good safety signals (credit where due):**
- Coach pre-emptively caps Tuesday to Z3 because of an HRV dip; plans a rest-day fallback for
  Friday; states ramp status ("within ramp limits"); lists Watch items with real numbers.
- Proposal includes a readiness gate (HRV ≥55, no leg heaviness) with conservative fallback.
- Rest days are first-class in the calendar; "Aerobic maintenance"/"Recovery jog" naming keeps
  easy days honest; run/walk structures supported.

**Scary gaps:**
- **The app never shows me what the coach sees.** HRV, fatigue, ramp rate: cited by the coach,
  displayed nowhere. I'm asked to trust safety reasoning I can't inspect. If HRV "flags red",
  where does it flag?
- **No warning-sign surface on the calendar.** The week card showing actual load at 2x planned
  (137 → 277) draws no attention. Comeback me needs green/yellow/red on the week, not raw
  arrows.
- **No place for constraints.** The physio protocol has to squeeze into a clipped textarea
  with a bottom-anchored save button. Nothing records soreness notes on days. Nothing tells me
  whether the coach actually honors them beyond my own reading of its replies.
- **Delete-then-add proposals** are a footgun when the "add" half lives in a second modal.

## Top 5 asks (prioritized)
1. **Wellness/risk strip on the calendar**: HRV trend, fatigue/form, and a weekly ramp-rate
   indicator (green/amber/red) next to the planned-vs-actual summary — make what the coach sees
   visible to me.
2. **Constraint-first athlete profile**: structured constraint fields (injury history,
   "≤X/10 discomfort" rules, max quality days/week, physio notes) given prominence, autosaved,
   and echoed back by the coach ("keeping this under your soleus rule") when it applies them.
3. **Readiness gates as a visible, reusable feature**: when a session is gated ("HRV ≥55 else
   easy run"), show the gate on the calendar day too, and how the gate evaluated that morning.
4. **Single-operation proposals** with before/after diff — and a distinct, louder treatment for
   destructive proposals vs swaps/updates.
5. **Post-session check-in hook**: one tap after a run ("legs/soreness 0-10, next-day rule")
   stored as data the coach reads — that's how a comeback athlete's lived feedback enters the
   plan loop.
