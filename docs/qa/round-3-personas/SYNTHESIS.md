# Round 3 — Persona Panel Synthesis

Moderator: 5 personas (over-preparer, time-crunched, data-skeptic, comeback, racer) walked all
19 flow surfaces as static screenshots (375px primary, 1280px twins for width judgments).
37 shots reviewed. Per-persona detail: `persona-*.md` in this directory.

## Findings matrix (sorted by personas affected × severity)

| # | Finding | OP | TC | DS | CB | RC | Sev |
|---|---------|:--:|:--:|:--:|:--:|:--:|-----|
| 1 | Proposal envelope: no before/after diff, raw DB ID `#147702969` in title, one swap split into two approvals (delete + update); destructive half presented casually | 🤨 | 🤨 | ✋ | 🤨 | 🤨 | **High** |
| 2 | Athlete profile (the coach's system prompt; where goals AND injury constraints must live) is a cramped, clipped textarea with a bottom-only Save button — silent-loss risk | 🤨 | 🤨 | 🤨 | ✋ | 🤨 | **High** |
| 3 | Races/blocks invisible in calendar: no race marker (legend has gold "race" dot; the Oct 11 marathon isn't shown as one), no A/B/C, no phase/countdown chip — while the coach's replies prove the block model exists ("bridge into the Winterlude block", "closes the recovery week") | 🤨 | — | 🤨 | 🤨 | ✋ | **High** |
| 4 | Coach's evidence is invisible: HRV, fatigue, ramp-rate cited with numbers ("HRV dip below 55", "46–48 mid-week") but displayed nowhere in the app — trust is unverifiable | 🤨 | — | 🤨 | ✋ | — | **High** |
| 5 | Raw markdown in coach replies (literal `**Mon**:` asterisks) on every reply, both widths | 🤨 | 🤨 | 🤨 | 🤨 | — | Med (trivial fix) |
| 6 | Calendar summary card is raw numbers with no verdict: LOAD 137 → 277 (2x plan) passes without comment; no ramp indicator, no green/amber/red | 🤨 | — | 🤨 | 🤨 | — | Med-High |
| 7 | Numeric inconsistencies: coach says "~340 load" while its own itemized loads and the calendar both say 297; recorded zone times sum 52m vs 48m duration (and 6m vs 7m); "BY TIME ≈ 2.0km · 32m" label undefined | 🤨 | — | ✋ | — | — | **High** (trust) |
| 8 | Bad data displayed deadpan: 2:56/km @ 145bpm shown with a green "recorded" check; month card divergence (distance down, load up) unexplained; no outlier flagging on sync | 🤨 | — | 🤨 | — | — | Med |
| 9 | Today not pinned/first in week view — daily loop requires scrolling past completed days to find today | — | 🤨 | — | — | — | Med-High (daily loop) |
| 10 | Coach reply format: dense prose blob, verdict ("Planned total…within ramp limits") buried after session bullets; no message timestamps; "Today (Sun)" conflicts with calendar's Sat-24 today-pill | 🤨 | 🤨 | 🤨 | 🤨 | — | Med |
| 11 | Month view is presence-only dots — no load trend/shape (comeback), no titles even on desktop (racer), no structure reading (over-preparer); acceptable at phone width (time-crunched) | 🤨 | 👍 | 🤨 | 🤨 | ✋ | Med |
| 12 | No "add race" affordance anywhere (month view, coach empty state, settings); "Plan my race week" is advertised with no path to declare a race | — | — | — | — | ✋ | Med-High (racer churn) |
| 13 | Coach empty state spends prime space on marketing copy instead of a briefing (today + week headline + pending proposals) | — | 🤨 | — | — | — | Med |
| 14 | Sign-in has no visible sign-up/forgot-password path; "Google — coming soon" | 🤨 | — | — | — | — | Low |
| 15 | Desktop (1280) is a stretched phone layout — stacked day cards, floating bottom nav; adds little at width | — | — | — | — | — | Low (moderator note) |

## Top 8 findings — prescriptive fixes (one line each)

1. **One logical change = one approval**: merge delete+add pairs into a single "Swap" proposal
   card showing `old session → new session` side by side; render human titles, never DB IDs.
2. **Make the athlete profile first-class**: full-height editor, autosave with dirty/saved
   indicator, plus structured fields (goal race, date, goal time, constraints) — it is the
   coach's system prompt, treat it like source code.
3. **Render the block model the coach already has**: phase/countdown chip in the calendar
   header ("Recovery W2 → Bridge to Winterlude · next race in X wks").
4. **Make races visible**: gold race marker + title in week and month views, A/B/C priority
   ring, "Add race" button on month view and coach empty state.
5. **Show the coach's evidence**: HRV trend + fatigue/form + weekly ramp rate strip on the
   calendar week card, with a one-line generated verdict ("load at 2x plan mid-week — check
   Tuesday") instead of silent arrows.
6. **Render coach markdown properly** and restructure replies: verdict/total line first
   (Week 50km · Load ▲ · Watch: HRV), session bullets after — chat is the headline coaching
   surface and currently ships asterisks.
7. **One arithmetic source of truth**: coach totals must be computed from the same planned
   aggregates as the calendar (297, not "~340"); reconcile zone-time sums with displayed
   durations (52m vs 48m) or annotate why they differ; label "BY TIME" (e.g. "quality ≈ 2.0km · 32m").
8. **Flag suspect data at sync time**: impossible pace/HR combos (2:56/km @ 145bpm) get a
   "data quality" badge, not a green check; add message timestamps so chat claims are
   datable (the "Today (Sun)" vs Sat-24 conflict).

## Buckets

### (a) Quick UI fixes
- Render markdown in chat bubbles (no literal `**`).
- Remove raw entry ID from proposal/event titles.
- Auto-scroll/pin today to top of week view on open ("today" pill already exists).
- Sticky save bar / autosave + dirty indicator in Settings (athlete profile especially).
- Label or drop "BY TIME ≈ x km · y m"; annotate zone-time vs duration discrepancies.
- Timestamps on chat messages; reconcile the "Today (Sun)" date grounding.
- Add sign-up / forgot-password affordances to sign-in.

### (b) Product / feature gaps
- Races as first-class calendar objects (marker, title, A/B/C, add-race flow) + phase/countdown
  header chip. *(Racer's deal-breaker; cheapest big win for the calendar.)*
- Wellness/risk surface: HRV trend, fatigue/form, ramp-rate, weekly verdict with
  green/amber/red — currently coach-only knowledge. *(Comeback's nightmare, skeptic's blocker.)*
- Single-swap proposals with before/after diff.
- Post-session check-in (soreness 0-10, next-day rule) as structured data the coach reads.
- Outlier/data-quality flagging on sync; planned-vs-actual time-in-zone distribution per
  session/week (explains distance-down/load-up divergences).
- Structured goal-event fields (race, date, priority, goal time) feeding both coach and calendar.
- Coach home as a briefing (today + week headline + pending proposals) instead of marketing copy.
- Onboarding asks "what are you training for?" (currently nothing does).

### (c) Coach-brain (prompt/memory) gaps
- **Arithmetic discipline**: coach's stated totals must be derived from the same source as the
  calendar aggregates — "~340 load" against 297 is the single worst trust failure observed
  (its per-session loads were exactly right, which makes the wrong total more damning).
- **Date grounding**: pass the authoritative current date into the prompt ("Today (Sun)" while
  calendar says Sat 24); never let relative day names float.
- **Constraint echo**: when the athlete profile carries constraints (physio protocol, cap
  rules), the coach should cite them when applying them ("capped at Z3 per your soleus rule") —
  today it happens to cite HRV, but nothing proves profile constraints are honored.
- **Race-window awareness in proposals**: rationales should reference block/race context
  ("fresh day, 3 weeks before your A race") — the placement logic is already correct; the
  narrative just doesn't say why in race terms.
- **Consistency of block vocabulary**: "Winterlude block" and "recovery week" exist in chat;
  the same names/phases must drive the calendar header chip so the two surfaces never diverge.

## Flagged by ALL five personas (near-certain real issues)
1. **The proposal approval envelope** (no diff, raw ID, split swaps) — every persona hit it from
   a different angle (reviewability, speed, auditability, safety, race context). This is the
   product's core interaction and it currently undersells the very good coach behind it.
2. **The athlete profile as the sole personalization surface, in its current fragile form** —
   cramped, clipped, bottom-save. Everyone's most important content (goals, constraints,
   physio rules) is one missed scroll away from silently not being saved.
3. **The calendar knows less than the coach** — blocks, phases, races, HRV all live in chat
   replies while every calendar screen shows unlabeled numbers and dots. Four personas
   independently described the same product in two halves that don't touch.

## What the panel genuinely liked (keep and amplify)
- The approve-every-change contract, stated on the splash and honored in every modal — all five
  personas flagged it as the reason they'd trust the product at all.
- Readiness gating in proposals ("HRV ≥55 else keep the easy run") — the comeback runner
  called it the best safety feature in the flow.
- Load-aware, non-cheerleading coach replies: ramp limits, 80/20 compliance checks, de-fanged
  sessions, watch items with real numbers — over-preparer and racer both said this passes the
  "real coach" sniff test.
- intervals.icu-grade session parsing (zone-colored warmup/main-set/cooldown, run/walk reps,
  SS–Z7 time-in-zone bars, COROS attribution).
- Honest, restrained landing page; write-only API key handling with test-connection and sync
  status; plan-vs-actual per session on the week view.
