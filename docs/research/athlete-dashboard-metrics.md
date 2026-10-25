# Athlete dashboard metrics — what goes on the calendar home screen

Written by the coach (for engineers), 2026-10-24. Companion to
`docs/research/intervals-api-brief.md` (field shapes, §6 wellness / §7 zones)
and `packages/core/src/prompts/knowledge.ts` (the 80/20 method behind every
threshold below).

The owner is an intermediate marathoner, a self-described over-preparer, who
asked for four things: planned vs actual volume, time-in-zones with imbalance
made obvious, fitness/fatigue direction, and a "gap rate" — if fitness is
drifting down, how much load holds it flat or returns form to zero. This spec
covers exactly that, and deliberately nothing more (see §4).

**This surface is read-only.** It renders numbers from intervals.icu reads and
pure client-side math. It never calls propose/update/delete and never writes to
intervals.icu — the tool-call contract belongs to the coach chat, not the
dashboard.

## 0. Conventions

| Thing | Convention |
|---|---|
| Load unit | intervals.icu training load (`icu_training_load`), dimensionless integers. One load number only — do not surface trimp/HRSS/pace-load as separate metrics. |
| Week | Athlete-local Monday–Sunday (ISO week), keyed off `start_date_local` dates. |
| Zone set | Primary zones from `icu_zone_times` (Z1–Z7 + SS objects). Map: **LOW = Z1+Z2, MODERATE = Z3+SS, HIGH = Z4–Z7.** Per-sport zone names come from `/sport-settings`. |
| Shares | Time-based, not distance-based (intensity balance counts time, per the knowledge base). Denominator = sum of all zone seconds in the week — self-consistent, since `icu_zone_times` sums to ≈ moving time, not elapsed. |
| Measured vs estimated | Every projected/forecast number is suffixed `(est)` in the UI. Measured numbers never carry qualifiers. |
| Formatting | Load: integer. Distance: 1 dp in athlete units. CTL/ATL: 1 dp. Form, drift, percentages: integers. |

---

## 1. Metric inventory

### 1.1 Weekly planned vs actual (distance / time / load)

- **Definition.** For the current calendar week: sum of `distance` (m),
  `moving_time` (s), `icu_training_load` across planned **events** vs recorded
  **activities** (`type` in Run/TrailRun/VirtualRun).
- **Source fields.** Events: `GET /athlete/{id}/events?oldest=&newest=`
  (`distance`, `moving_time`, `icu_training_load` — planned events compute load
  server-side, verified live). Activities: same fields, week-filtered.
- **Pairing / honesty split.** Join activity → event via `paired_event_id`.
  Three buckets, all shown:
  - *done as planned* (paired),
  - *missed* (event with no paired activity, past its date),
  - **extra** (activity with no paired event). Extra load must be visible, not
    silently absorbed — for an over-preparer this is the single most useful
    honesty check on the card.
- **Why he cares.** The owner said it directly: "total distance planned/actual
  matters." Completion percentage is secondary to the shape (what was missed
  vs what was added).
- **Cadence.** Planned totals: live from the events read; recompute on any
  calendar change. Actuals: incremental on each activity sync.

### 1.2 Time-in-zone distribution + imbalance flags

- **Definition.** Week rollup of `icu_zone_times` across activities (and
  `workout_doc.zoneTimes` across *future* events, shown separately as "planned
  mix"). Three numbers: LOW%, MOD%, HIGH% of zone time.
- **Thresholds, non-race week** (from the 80/20 base in knowledge.ts — 80/20
  is a population optimum, ~75–85% low is healthy, the moderate trap is the
  failure mode that matters):
  - **LOW ≥ 75%** healthy · **60–74%** amber ("easy runs are drifting") ·
    **< 60%** red, **moderate-trap warning**. This is the owner's proposed
    <60% line and it matches the evidence base: below ~60% low, the week is
    mostly middle-intensity stress with little of the stimulus either end
    provides.
  - **MOD > 20%** red regardless of LOW% (threshold-heavy weeks add fatigue
    without proportional fitness); amber 10–20%. Exception, not shown as red
    during final 8–10 weeks before half/marathon when marathon-pace work
    legitimately raises MOD — the flag text should say "MP block, expected."
  - **HIGH > 25%** red; 2 high-quality sessions/week is the ceiling in the
    method, and >25% of time in Z4+ almost always means a third one or a
    quality session that ran long.
  - **Fence-rider flag (per run).** Any run *planned or labeled easy* with
    >10% of its time in Z3+SS gets flagged on the weekly card ("Tue easy sat
    in Z3 14% — this is where the trap lives"). This is intensity blindness
    made concrete: runners believe they run easier than they do.
- **Why he cares.** Owner: "time-in-zones with imbalance highlighting matters."
  The distribution is the earliest warning the coach can act on — it fails
  weeks before fitness numbers move.
- **Cadence.** Recompute on each activity sync; planned mix on calendar change.

### 1.3 Fitness/fatigue trend (CTL/ATL, 7-day)

- **Definition.** From the wellness mirror (`GET /athlete/{id}/wellness`):
  `ctl` (fitness), `atl` (fatigue). Trend = `ctl(today) − ctl(7 rows ago)`,
  likewise ATL. This answers the owner's literal question, "is fitness going
  up or down."
- **Display.** One line: `CTL 42.3 ▲ +0.6/wk · ATL 45.1 ▼ −1.2/wk`. Arrows
  carry sign; never show a naked absolute without its weekly delta.
- **Special case worth its own flag:** fitness falling **and** form positive
  at the same time is *detraining*, not recovery — it feels identical to a
  taper from the inside. An over-preparer will read "I feel fresh" as license
  to add load. The card should say so when it happens: "fresher, but fitness
  −1.0/wk — this is detraining, not a taper (est)." Flag when ΔCTL_7 ≤ −1.0
  and form > 0.
- **Cadence.** Daily after device sync; past wellness rows are final.

### 1.4 Form (TSB)

- **Definition.** `form = ctl − atl`, computed client-side — intervals.icu
  does **not** return it (confirmed, API brief §6).
- **Conventional bands** (Coggan TSB heuristics, also intervals.icu's own
  coloring intuition; they are guidance, not physics):
  | Band | Meaning | Card treatment |
  |---|---|---|
  | ≥ +25 | Very fresh; prolonged = detraining risk | "very fresh — don't waste it (or check you're not detraining)" |
  | +5 … +25 | Fresh / race-ready; taper target lives here | green |
  | −10 … +5 | Neutral — the productive training zone | green, no comment |
  | −30 … −10 | Fatigued, productive if deliberate | amber |
  | ≤ −30 | Deeply fatigued | red, matches the coach prompt's hard flag |
- **Why he cares.** Form is the number that arbitrates "push or back off
  today," and the owner explicitly wants trend + level, not a single scary
  negative.
- **Cadence.** Daily (same pull as 1.3).

### 1.5 Ramp rate

- **Definition.** intervals.icu ships `rampRate` on each wellness row (live
  value: 0.91 on 2026-10-24). Intervals.icu computes it as the 7-day average
  of ATL divided by the 7-day average of CTL — an acute:chronic ratio.
  **Acceptance check before shipping:** recompute `mean(atl[−7..−1]) /
  mean(ctl[−7..−1])` from live rows and require agreement with the served
  `rampRate` within 0.01. If it disagrees, stop and re-derive — do not ship a
  guess.
- **Bands.** 0.8–1.3 healthy; > 1.5 red (spike — the injury trigger is sudden
  load, not load); < 0.8 amber (detraining or deliberate taper — context from
  the race countdown decides which).
- **Why he cares.** It is the single best "am I ramping like an idiot" number,
  and over-preparers ramp like idiots exactly when fitness answers are slow.
- **Cadence.** Daily. Note this is a *display* metric; the planning-side
  constraint (acute week ≤ 110% of rolling 4-week average) stays in the coach,
  not on the card.

### 1.6 The gap / load-needed metrics

Owned by §2 below. Summary for the inventory: three pure-function numbers —
**fitness-flat load** (hold CTL flat), **form-flat load** (hold today's form
steady 7 days), **form-to-zero load** (reach neutral in 7 days) — plus the
deficit translation (weekly load shortfall → CTL drift per week). Daily recompute.

### 1.7 Recovery context (secondary only)

- 7-day rolling averages and direction for `hrv`, `restingHR`, `sleepSecs`.
  **Never** a single-day value on this surface — day-to-day HRV is noise.
  Amber flag only on persistent moves: HRV down ≥3 consecutive days, or
  restingHR up ≥3 days, each shown *alongside* form, never alone (they modify
  the form story, they don't replace it).
- Cadence: daily.

---

## 2. The gap / load-needed math

### 2.1 The model (exact)

intervals.icu uses Coggan-style exponentially weighted states with default
time constants **CTL 42 days, ATL 7 days** (overridable per event via
`ctl_days`/`atl_days`; assume defaults, verify per §2.6). Each day:

```
CTL_d = CTL_{d-1} + (L_d − CTL_{d-1}) / 42
ATL_d = ATL_{d-1} + (L_d − ATL_{d-1}) / 7
form_d = CTL_d − ATL_d
```

where `L_d` is that day's total training load (0 on rest days — rest is real
data). The wellness row for date D holds the state **after** D's load.

Constant daily load `L` for k days has the closed form:

```
CTL_k = C0·a^k + L·(1 − a^k)      a = 41/42
ATL_k = A0·b^k + L·(1 − b^k)      b = 6/7
```

### 2.2 Constants (precompute, don't guess)

With `F0 = C0 − A0`, the general required-constant-load closed form, over k
days, to land on target form T:

```
L_k(T) = cA(k)·A0 − cC(k)·C0 + cT(k)·(F0 − T)

cC(k) = (1 − a^k) / (a^k − b^k)
cA(k) = 1 + cC(k)                     (exact identity — use as a unit test)
cT(k) = 1 / (a^k − b^k)
```

| k | a^k | b^k | cC | cA | cT |
|---|---|---|---|---|---|
| 1 | 0.976190 | 0.857143 | 0.20000 | 1.20000 | 8.40000 |
| **7** | 0.844777 | 0.339917 | **0.30746** | **1.30746** | **1.98075** |
| 14 | 0.713648 | 0.115543 | 0.47877 | 1.47877 | 1.67195 |
| 28 | 0.509293 | 0.013350 | 0.98944 | 1.98944 | 2.01636 |

The k=7 row is the one the card uses. For any other horizon compute the powers
from the exact rationals 41/42 and 6/7 — never hardcode beyond k=7.

### 2.3 (a) Hold form flat over the next 7 days

Set T = F0, k = 7:

```
L*_7 = A0 − 0.30746 · F0            (daily)
weekly hold-flat = 7 · L*_7
```

Reading: hold-flat load ≈ current ATL adjusted by ~31% of form. A fresh
athlete (F0 > 0) can train *below* current ATL and stay equally fresh; a
fatigued athlete (F0 < 0) must train slightly *above* ATL to avoid recovering
past their current form (fitness momentum lifts form on its own — holding a
negative form requires paying for it).

### 2.4 (b) Bring form to zero over 7 days

Set T = 0, k = 7 (equivalently `L_7(0) = L*_7 + 1.98075 · F0`):

```
L_zero = A0 + 1.67329 · F0          (daily)
```

F0 negative → load *below* ATL (a genuine cut week). F0 positive → reaching
zero requires a load *spike* — which is the honest answer when someone asks
how to "use" freshness: you don't coast to neutral, neutral from fresh costs
training.

General taper form: to hit race-day form T (e.g. +10) in k days, use
`L_k(T)` from §2.2. This powers the race-day forecast in §3.

### 2.5 (c) The fitness gap ("gap rate")

CTL-flat is the degenerate beautiful case: constant load `L = C0` holds CTL
exactly flat, and more generally over any 7-day window at constant load:

```
ΔCTL_week = (1 − a^7) · (L̄ − C0) = 0.15522 · (L̄ − C0)
```

so, inverting — **if fitness is drifting down X per week, the load deficit is:**

```
daily deficit   = X / 0.15522 = 6.44 · X   (load/day below current CTL)
weekly deficit  = 45.1 · X                 (load/week below 7·CTL)
```

Round-trip example: daily load 40 for a week with CTL 50 → ΔCTL = 0.15522 ×
(−10) = −1.55/wk; and 10/day × 7 = 70/wk shortfall ÷ 1.55 = 45.1 ✓.

Honesty note for the card copy: this is the *first-week* rate. A sustained
deficit doesn't drain CTL linearly — each week's loss is 0.15522 of the
remaining gap, so CTL converges to the recent average load over ~6–8 weeks.
Quote the current weekly rate; never extrapolate it linearly for months.

### 2.6 Canonical implementations (pure functions)

```ts
// Inputs: latest wellness row {ctl, atl}; loads[7] = planned-or-actual daily
// loads for the NEXT 7 days (0 for rest). All pure; no I/O.

export function project(ctl0: number, atl0: number, loads: number[]) {
  let c = ctl0, a = atl0;
  for (const L of loads) { c += (L - c) / 42; a += (L - a) / 7; }
  return { ctl: c, atl: a, form: c - a };
}

export function requiredDailyLoad(ctl0: number, atl0: number,
                                  days: number, targetForm: number) {
  const ak = Math.pow(41 / 42, days), bk = Math.pow(6 / 7, days);
  const cC = (1 - ak) / (ak - bk), cT = 1 / (ak - bk);
  return (1 + cC) * atl0 - cC * ctl0 + cT * (ctl0 - atl0 - targetForm);
}

// convenience: requiredDailyLoad(c, a, 7, c - a)  = form-flat
//              requiredDailyLoad(c, a, 7, 0)      = form-to-zero
//              requiredDailyLoad(c, a, k, kFlat)  where CTL flat ⇒ L = C0
```

Day-by-day `project` is canonical for forecasts with varying daily loads (it
is exact for any pattern); the closed form is exact for constant load and is
what the card quotes.

### 2.7 Worked example (the acceptance test)

Round numbers: `C0 = 42, A0 = 45, F0 = −3` (fatigued-but-productive zone).

- **Hold-flat:** `L* = 45 − 0.30746×(−3) = 45.92/day → 321/week`. Check by
  recursion: form7 = −3.0000 exactly (fitness actually *rises* 42 → 42.61
  while form holds — correct, that's what holding a fatigued state costs).
- **To zero in 7 days:** `L = 45 + 1.67329×(−3) = 39.98/day → 280/week`.
  Recursion: form7 = 0.0000 exactly.
- **Fitness-flat:** 42/day → 294/week.
- **The owner's actual week, say 266 (38/day):** recursion gives CTL7 = 41.38
  (drift **−0.62/wk** — matches 0.15522×(38−42) ✓) and form7 = **+1.0**.
  Card copy: "fitness 42.0 → 41.4 by Sunday (est); form −3 → +1 (est). You're
  28/wk under fitness-flat."
- **Live athlete, 2026-10-24 row** (`ctl 41.87, atl 43.38`): F0 = −1.51;
  hold-flat 43.84/day = **307/wk**; to-zero 40.85/day = **286/wk**;
  fitness-flat 293/wk. Recursion: hold-flat reproduces form7 = −1.5100, to-zero
  form7 = 0.0000. Ship these as unit-test fixtures.

Unit-test invariants (from §2.2): `cA(k) − cC(k) = 1` for all k; each closed
form must agree with `project()` to <1e-3; and `requiredDailyLoad(c, a, 7, 0)`
must land form7 in [−0.01, +0.01] by recursion for C0, A0 ∈ [10, 150].

---

## 3. Grouping & hierarchy

The owner nailed it: **"where I'm at" and "what I need to do this week" are
different entities.** The first is a state read (glanceable, zero
interaction); the second is a prescription (expandable, carries the est
numbers). Do not blend them — a dashboard that makes you hunt for the verdict
will be ignored exactly when it matters.

### PRIMARY — the "where I'm at" strip (always visible)

| Slot | Content | Source |
|---|---|---|
| 1. Fitness direction | `CTL 42.3 ▲ +0.6/wk · ATL 45.1 ▼ −1.2/wk` | §1.3 |
| 2. Form | `Form −3 — productive fatigue` + band color + 7-day trend arrow | §1.4 |
| 3. This week | `planned 61.0k / 8.2h / load 322 — done 48.2k / load 266 (+12 unplanned)` | §1.1 |

Three glanceable facts. If the athlete looks at nothing else, he knows his
trajectory, his state, and his week's execution — including the unplanned
extra that an over-preparer needs to see in print.

### SECONDARY — the "what I need to do" drawer (expand / hover)

| Slot | Content | Source |
|---|---|---|
| 4. Zone balance | Stacked LOW/MOD/HIGH bar with %s + flags (moderate-trap, fence-rider callouts) | §1.2 |
| 5. Gap card | `Hold-flat ≈ 321/wk (46/day) · planned week lands at 266 → 55 under` + the projected end-of-week form/fitness `(est)` | §2 |
| 6. Recovery context | 7-day HRV / restingHR / sleep directions; amber only on persistent moves | §1.7 |
| 7. Race-day form forecast | When a race is ≤ 6 weeks out: "planned taper puts form ≈ +9 on race day (est)" — or the honest red version, "planned load keeps you at −12 on race day; you're overcooking the taper" | `project()` over planned event loads |

### Headline verdicts (2–3 lines, generated, top of the card)

Verdicts must quote numbers that are on the card, and every projection carries
`(est)`. Templates:

1. **State:** `Form −3, steady this week — productive zone.`
2. **Load:** `Hold-flat load ≈ 321/week. You're at 266 — under by 55; fitness drifts −0.6/wk, form eases to +1 by Sunday (est).`
3. **Zones (only when flagged):** `71% low this week — amber: two easy runs sat in Z3.`

Plus the two conditional honesty verdicts: the detraining flag from §1.3 and
the overcooked-taper forecast from slot 7. For this athlete, those two
sentences are the product: they're the checks an over-preparer cannot run on
himself.

---

## 4. What NOT to show (and why)

| Metric | Verdict | Reason |
|---|---|---|
| VO2max estimate | Out | Device-derived, noisy, moves so slowly it can't steer decisions; pure vanity at this surface. |
| Single-day HRV / restingHR / SpO2 | Out | Day-to-day noise; only 7-day direction belongs (§1.7). |
| Vendor "readiness" scores | Out | Opaque composites; we already show the ingredients (form, HRV trend, sleep) with honest definitions. |
| Weight | Out | Private, noisy, not requested; only useful under a deliberate tracking plan. |
| Streaks, all-time distance, YTD totals | Out | Vanity metrics that reward junk miles — actively harmful for an over-preparer. |
| trimp / HRSS / pace_load alongside training load | Out | Four load numbers means no load number. One unit, everywhere. |
| eFTP / wPrime / pMax curves | Out | Dashboard noise for a runner; pace zones in the coach chat already encode threshold. |
| Per-run zone breakdowns on the home surface | Out | Belongs in activity detail. Home shows the weekly rollup + named fence-rider flags only. |
| Absolute ATL on the primary strip | Out | Fatigue level without fitness context scares people; form + trend carries the decision. ATL lives in the expanded view. |
| "Calories burned" | Out | Not training data. |

The pattern behind the list: this screen shows **state, direction, and
prescription**. Anything that flatters, duplicates, or requires a PhD to act
on, cut.
