# Persona review — The Data Skeptic

> 40s, long-time intervals.icu power user. I know my CTL/ATL/TSB, my LTHR, my threshold pace to
> the second. I already have a system; I'm deciding whether this AI coach layer is a serious
> tool or a toy. I verified every number these screenshots would let me verify. Reviewed from
> static screenshots, phone-width (375px) primary, 1280px for desktop twins.

## Flow reactions

### 1. splash-hero — 👍 works
"80% easy. 20% fast." with the honest caveat "closest thing the running literature has to a law"
— appropriately hedged claims. "simplified view of your intervals.icu" is accurate positioning,
not vaporware.

### 2. splash-scrolled — 👍 works
Real sources (Fitzgerald & Johnson; Fitzgerald & Rosario), "principles, not passages". The
green/red 80/20 bar is proportionally honest. Nothing overclaimed so far.

### 3. splash-footer — 👍 works
The disclaimer explicitly says "not medical or professional advice" and doesn't dress the
product up as a physiologist. Rigor points for restraint.

### 4. sign-in — 👍 works
Nothing to verify here. (BYO-key architecture confirmed later in settings, which is the
notable claim, and it's stated plainly.)

### 5. calendar-week-current — 🤨 doubt
I checked internal coherence: summary says LOAD 137 → 277; itemized session loads below
(38 + 92 + 16 + 61 + …) are consistent with 277 actual by Sat. Planned-vs-actual arrows use a
consistent convention (grey → bold). Tue 20 is the interesting one: planned 8.1km/44m/load 50 vs
actual 8.8km/48m/load 92 — load more than doubling at similar volume is *possible* if intensity
overshot, but the app gives me no way to see *why* (no planned-vs-actual intensity distribution).
Coherent but unauditable.

### 6. calendar-week-current-scrolled — 🤨 doubt
Sat actual: 8.4km · 47m · **2:56/km** · 145bpm · load 70. That pace/HR combination is not
physiologically possible for a club runner — 2:56/km is 5K world-record territory at a
145bpm average. This is almost certainly a corrupt GPS/distance or a watch data issue, and the
app displays it deadpan next to a green "recorded" check. A serious tool flags outliers; this
one launders them into my training log. (Same class of issue: Tue actual 3:00/km avg at 156bpm
for 48 minutes — implausible.)

### 7. calendar-week-next — 👍 works
Planned-only week shows dashes for actuals instead of zeros — correct handling of the empty
state. Mon 6.7km/39m/load 38 and Tue 8.5km/47m/load 52: loads scale sanely with duration. The
"Z3" rep-scheme naming in the run club title matches intervals.icu conventions.

### 8. calendar-month — 🤨 doubt
October: DISTANCE 126.7 → 105.0 planned→actual but LOAD 849 → 927 (actual *above* plan while
distance is *below*). Internally possible — if intensity ran hot on lower volume — but nothing
on screen helps me confirm it, and given the individual implausible paces above I suspect the
actual-side loads are inflated by bad data. Also: Oct 11 — the marathon — carries two dots but
no gold "race" dot anywhere in the month despite the legend defining one. Either races aren't
tagged or the tag isn't applied to real data; both are bad looks.

### 9. day-detail — 🤨 doubt
The parse matches the description text exactly (10×1' hard/easy + 5×2' mod/walk, zones Z4/Z1,
Z3/Z1). Zone naming is intervals.icu-consistent (Z1–Z7, SS appears in recorded data). Two
nits: "BY TIME ≈ 2.0km · 32m" is an undefined metric (32 minutes of the 44-minute session? the
quality portion by time? unlabeled), and the raw description blob repeats the parsed UI
verbatim — duplication, not verification, which is the only kind this screen offers.

### 10. day-detail-scrolled — 🤨 doubt
This is where I got out the spreadsheet. Recorded legend: SS 7m + Z1 11m + Z2 2m + Z3 7m +
Z4 9m + Z5 6m + Z6 8m + Z7 2m = **52m of zone time against a displayed 48m duration**. Zone
time can't exceed moving time without an explanation (pauses? rounded segments?). The Afternoon
Run legend (Z4 1m + Z5 3m + Z6 2m = 6m) against a 7m duration has the same off-by-one smell.
Small errors, but load math is built on exactly these time-in-zone numbers. COROS attribution
is good rigor.

### 11. coach-empty — 👍 works
"The coach sees your calendar, recent activities and fatigue" — a checkable claim, and the
conversation screenshots do show it citing HRV. "Changes it proposes show up as approvals — you
decide" matches the proposal modals. Claims and behavior are consistent.

### 12. coach-conversation — 🤨 doubt
Grounding is real: it cites per-session loads that match the calendar exactly (38, 52, 44), the
HRV dip below 55, and "closes the recovery week" — that's calendar-and-metrics awareness, not
chatbot patter. But: raw `**asterisks**` in the rendered bubble mean the chat path has no
markdown pipeline — a rigor signal. And it says "Today (Sun)" while the calendar's today pill
says Sat 24: either this thread is from a different day with no timestamp shown, or the coach's
date grounding slipped. Conversations need visible timestamps to be auditable.

### 13. coach-streaming-reply — ✋ blocker
I did the arithmetic on its own answer. "Planned total: ~50km, **~340 load**." Its itemized
sessions (38 + 52 + 44 + 26 + 56 + 81) sum to **297** — the same 297 the next-week summary card
displays. So the coach contradicts both the calendar *and itself* by ~43 load (14%) in the same
message. The individual numbers are right and the stated total is wrong — the worst failure
mode, because it looks authoritative. The "Watch items" content itself (HRV 46–48 mid-week, 61
Saturday, fatigue 43) is exactly what I want an AI coach to cite — but nowhere in this app can
I *see* HRV or fatigue myself to check the coach's claims. No wellness panel, no form/fitness
chart, no source link on any number.

### 14. proposal-modal — 🤨 doubt
"This is a proposal, not a write" — correct safety language. The rationale is training-literate
("quality sits on a fresh day, not stacked on Tuesday's run club"). But a swap presented as
"Delete calendar entry" with the add-half in a separate proposal is a data-model leak: one
semantic operation, two atomic writes, and no indication of the pairing. If I approve the
delete and dismiss the add, I've silently destroyed the session.

### 15. proposal-modal-timeline — ✋ blocker
"EVENT **#147702969** — Z4 cruise intervals" — a raw database ID in user-facing UI. And
"Update calendar entry" shows only the *new* state: WHEN 2026-10-29 · 18:00, the workout spec,
the gate condition. **The before-state is absent.** An update proposal without a diff is not
reviewable — I'm asked to approve a change to a record I can't see. (The workout content
itself is excellent: HRV ≥55 gate, 80/20-compliant single quality day. The brain is serious;
the proposal envelope isn't.)

### 16. settings-account — 👍 works
Athlete ID i67187 with the pointer to intervals.icu Settings → Developer; write-only API key
with press-and-hold reveal (correct pattern, not a stored-plaintext reveal); "Test connection";
"sync status: ok · synced 1h ago". This screen was built by someone who has actually wired up
an API integration.

### 17. settings-ai-model-picker — 👍 works
BYO OpenRouter key, "the app never sees the key the worker uses", three named models with an
explicit DEFAULT. The athlete profile labeled "(given to the coach)" — honest about it being a
system-prompt input. I'd want per-model metadata (context window, cost) and the full profile
visible (it's clipped mid-sentence in a small scroll box).

### 18. settings-preferences — 🤨 doubt
Units toggle km/mi — does it actually recompute *everything* (paces, zone labels, load
conventions) or just the unit strings? No way to tell from screens, and nothing marks which
numbers are stored vs converted. Manual "Save changes" at page bottom with no dirty-state
indicator is a silent-data-loss pattern I don't tolerate from serious tools.

### 19. signed-out — 👍 works
Clean state reset. Fine.

## Specialty: verifying the numbers
Checked and cleared: summary↔session load consistency (week current), planned-only empty states,
zone naming conventions, session-parse fidelity vs description text, coach's per-session load
citations, API key handling, sync status presentation.
Checked and failed:
- **Zone-time sums vs duration**: 52m shown for a 48m run; 6m for a 7m run. (day-detail-scrolled)
- **Coach's own total**: "~340 load" vs itemized 297 vs calendar 297. (coach-streaming-reply)
- **Implausible data displayed without comment**: 2:56/km @ 145bpm; 3:00/km avg for 48m. No
  outlier flagging anywhere.
- **Unverifiable claims**: coach cites HRV/fatigue numbers that no screen in the app displays.
  No drill-down from any coach statement to its source data.
- **Month card divergence** (distance down, load up) with no intensity-distribution view to
  explain it; no race dot on the actual marathon day.

## Top 5 asks (prioritized)
1. **Proposal diffs with before/after** — old session vs new session side by side, no raw IDs in
   titles, and atomic multi-step operations (swaps) as one proposal.
2. **Show the coach's evidence**: an HRV/wellness + form (fitness/fatigue/form) panel, and
   tappable source links from coach claims ("HRV 61 Saturday") to the underlying data.
3. **Fix numeric rigor**: reconcile zone-time sums with durations; make coach totals arithmetically
   consistent (have it recompute from the same planned totals the calendar uses); timestamps on
   chat messages.
4. **Outlier/data-quality flagging** on sync: pace/HR impossible combos (2:56/km @ 145bpm)
   should be marked suspect, not displayed with a green recorded check.
5. **Render markdown properly in chat** and show an intensity distribution (time-in-zone
   planned vs actual) per session and per week, so planned-vs-actual load divergences are
   explainable.
