# VDOT spec — implementation-ready specification for Jack Daniels' VDOT system

**Scope.** Implement the *math* of Jack Daniels' VDOT system from the published formulas. The
formulas themselves are not copyrightable and are reproduced across multiple open-source
projects and public pages; Daniels' **printed tables are copyrighted** and must NOT be embedded
or reproduced. Credit the method: the equations originate with Jack Daniels & Jimmy Gilbert,
*Oxygen Power: Performance Tables for Distance Runners* (1979), popularized in Daniels'
*Daniels' Running Formula*. (The books present only the resulting tables; the underlying math is
public, e.g. https://simpsonassociatesinc.com/runningmath1.htm — Daniels & Gilbert derived the
"percent of VO2max sustainable for duration" curve from elite performers' known VO2max values.)

---

## 1. Core equations (verbatim constants, cross-checked)

### 1.1 Oxygen cost of running (velocity → VO2)

```
VO2 (ml/kg/min) = -4.6 + 0.182258 * v + 0.000104 * v^2
```
where `v` = running velocity in **meters per MINUTE** (m/min). This is the classic trap:
not m/s, not km/h. Conversions: `m/s = v / 60`, `km/h = v * 0.06`, `min/km pace = 1000 / (v / 60)`.

### 1.2 Percent of VO2max sustainable for duration t (the decay curve)

```
%max(t) = 0.8 + 0.1894393 * exp(-0.012778 * t) + 0.2989558 * exp(-0.1932605 * t)
```
where `t` = race duration in **minutes**. Note the third exponent is **0.1932605**. One public
page (team-pinnacle.org) prints `0.1932705` — a fifth-decimal typo; every code implementation
checked uses `0.1932605` and reproduces Daniels' tables. Beware another widely-circulated typo
with `-1.92885` (decimal-point error): that term becomes negligible for all t > ~1 min, which is
why the typo survives, but it breaks short-duration accuracy (%max at 4 min should be ~1.10-1.12,
i.e. >100% VO2max; with the wrong constant it computes ~0.98).

### 1.3 VDOT from a race performance

```
v    = distance_meters / time_minutes
VO2  = -4.6 + 0.182258 * v + 0.000104 * v^2
pct  = 0.8 + 0.1894393 * exp(-0.012778 * t) + 0.2989558 * exp(-0.1932605 * t)
VDOT = VO2 / pct
```

### 1.4 Cross-checked implementations (constants agree exactly)

| Project | Language / license | Where the math lives | Constants |
|---|---|---|---|
| **CassioMaciel/Daniels_Running_Formula** | Python, MIT | `src/vdot_calculator/direct.py` — https://github.com/CassioMaciel/Daniels_Running_Formula | `-4.6 + 0.182258v + 0.000104v²`; `0.8 + 0.1894393·e^(-0.012778t) + 0.2989558·e^(-0.1932605t)` (cites letsrun threads where Daniels confirmed the equations: forum threads 3704747 & 4858970; letsrun blocks scraping, fetch via browser if needed) |
| **tlgs/vdot** | Python (TUI), embeds a Daniels-3rd-edition-range table (VDOT 30.0-85.0) generated *from the formulas* | `vdot.py` and table generator `misc/generate.py` — https://github.com/tlgs/vdot | Identical constants; also gives the exact quadratic inverse for pace (below) |
| **st3v/running-formulas-mcp** | Python (MCP server) | `src/running_formulas_mcp/formulas/daniels.py` — https://github.com/st3v/running-formulas-mcp | Identical constants; adds a *quadratic approximation* of the inverse (`29.54 + 5.000663·v - 0.007546·v²`) and Newton-iteration marathon inversion |
| Public web pages quoting the same form | — | https://gethealthycalculators.com/vdot-calculator · https://calculatorlib.com/running-vo2max-calculator · https://runbundle.com/tools/vo2-max-calculators/vo2-max-calculator | Same constants (team-pinnacle.org's `-0.1932705` is a typo as noted) |

**Recommendation:** use the exact formulas (§1.1-1.3) and the exact inverse (§2.1). Do not use
st3v's quadratic approximation of the inverse — it drifts at VDOT < ~40 and > ~65; the closed-form
inverse is trivially available.

## 2. Inverse operations (pace and race-time from VDOT)

### 2.1 Velocity from an oxygen cost (exact quadratic inverse)

Solving §1.1 for v given `VO2eff = VDOT * pct`:

```
v (m/min) = (-0.182258 + sqrt(0.182258^2 + 4 * 0.000104 * (VO2eff + 4.6))) / (2 * 0.000104)
```

(Implemented in tlgs/vdot `g()`; same form re-derived here.)

### 2.2 Race-time prediction (invert the decay curve numerically)

There is no closed form for t in §1.2 (sum of exponentials). Solve
`f(t) = [ -4.6 + 0.182258·(D/t) + 0.000104·(D/t)² ] / %max(t) - VDOT = 0`
by bisection over t ∈ [~2, 600] minutes (bisection is robust; Newton as in st3v works too).

## 3. Training-pace zones (percent of VDOT)

Open-source projects apply Daniels' published intensity bands as **percent-VDOT** percentages
(Runalyze applies them to vVO2max; gethealthycalculators lists them; Daniels' books publish them
as %VDOT ranges — facts of the system, not table contents):

| Zone | Purpose | %VDOT band | Session use |
|---|---|---|---|
| **E** Easy | aerobic volume, recovery | **59-74%** | most running; long runs |
| **M** Marathon | marathon-specific endurance | **75-84%** (race pace ≈ 81-85% in practice) | MP segments, steady long-run work |
| **T** Threshold | lactate threshold / cruise intervals | **83-88%** | ~20 min continuous or cruise reps (~5:00/km of T-pace work; "T-pace ≈ pace sustainable ~1 h") |
| **I** Interval | VO2max | **95-100%** | 3-5 min reps (e.g. 1000-1600 m), ~6-min race pace |
| **R** Repetition | speed, economy, anaerobic capacity | **105-120%** | 200-400 m reps, full recovery; ~2-min race pace |

Implementation notes:
- **M-pace**: Daniels' tables derive M-pace from the *marathon race time at that VDOT* (§2.2 with
  D = 42195), which lands at ~81-84% VDOT for mid-range athletes, not a fixed percentage. tlgs does
  exactly this (bisection); st3v does Newton iteration. Recommended: compute M-pace by marathon
  inversion, and use the 75-84% band only for MP work *within* workouts.
- tlgs/vdot uses single anchor points E-lo 0.6304 / E-hi 0.7346 / T 0.8799 / I 0.9743 of VDOT, with
  R-pace = I-pace − 15 s/km (−20 s/km below VDOT 50). These are fitted approximations of the printed
  tables; computing from the bands in the table above tracks Daniels' tables within ~1-3 s/km.
- Velocity from %VDOT: apply §2.1 with `VO2eff = VDOT * pct`.

## 4. Pseudo-code (implementation-ready)

```ts
// Units: distance meters, time minutes, velocity m/min, pace seconds/km.
const A = -4.6, B = 0.182258, C = 0.000104;      // oxygen-cost curve
const P = [0.8, 0.1894393, 0.012778, 0.2989558, 0.1932605]; // %max decay

function oxygenCost(v: number): number { return A + B * v + C * v * v; }

function pctMax(t: number): number {
  return P[0] + P[1] * Math.exp(-P[2] * t) + P[3] * Math.exp(-P[4] * t);
}

function vdotFromPerformance(distanceM: number, timeMin: number): number {
  const v = distanceM / timeMin;                 // m/min — NOT m/s
  return oxygenCost(v) / pctMax(timeMin);
}

// exact inverse of oxygenCost
function velocityFromVo2(vo2: number): number {
  return (-B + Math.sqrt(B * B + 4 * C * (vo2 + -A))) / (2 * C);
}

function paceSecPerKm(v: number): number { return 1000 / (v / 60); }

function paceAtPctVdot(vdot: number, pct: number): number {
  return paceSecPerKm(velocityFromVo2(vdot * pct));
}

// marathon race pace at this VDOT (Daniels' M-pace construction)
function marathonPace(vdot: number): { pace: number; timeMin: number } {
  let lo = 60, hi = 600;                          // bisect f(t) = vdot
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2, v = 42195 / mid;
    (oxygenCost(v) / pctMax(mid) < vdot) ? hi = mid : lo = mid;
  }
  return { pace: paceSecPerKm(42195 / lo), timeMin: lo };
}

function trainingPaces(vdot: number) {
  return {
    easy:     [paceAtPctVdot(vdot, 0.74), paceAtPctVdot(vdot, 0.59)], // slow..fast
    marathon: [marathonPace(vdot).pace],                              // race-based
    threshold:[paceAtPctVdot(vdot, 0.88), paceAtPctVdot(vdot, 0.83)],
    interval: [paceAtPctVdot(vdot, 1.00), paceAtPctVdot(vdot, 0.95)],
    repetition:[paceAtPctVdot(vdot, 1.10), paceAtPctVdot(vdot, 1.05)],
  };
}

// race prediction: bisect time for target distance (see §2.2), or reuse marathonPace pattern.
```

## 5. Worked example (unit-test fixture): half marathon 1:29:10

Input: `distance = 21097.5 m`, `time = 89.16667 min`.

- `v = 236.61 m/min` (= 3.943 m/s = 14.20 km/h)
- `VO2 = -4.6 + 0.182258×236.61 + 0.000104×236.61² = 44.346`
- `%max(89.1667) = 0.8 + 0.1894393·e^(-1.13938) + 0.2989558·e^(-17.232) = 0.8606`
- **VDOT = 44.346 / 0.8606 = 51.5** (51.53)

Training paces from VDOT 51.5 (computed via §4; round display to whole s/km):

| Zone | pace /km | pace /mi | Notes |
|---|---|---|---|
| Easy (59-74%) | 5:44 → 4:47 | 9:13 → 7:41 | slow bound → fast bound |
| Marathon (race inversion) | **4:24** | 7:06 | = 81.8% VDOT; marathon time ≈ 3:05:00-3:06 |
| MP band (75-84%) | 4:43 → 4:19 | 7:36 → 6:56 | workout guidance band |
| Threshold (83-88%) | 4:21 → 4:09 | 7:00 → 6:41 | T-pace ≈ 4:09-4:12 /km |
| Interval (95-100%) | 3:54 → 3:44 | 6:17 → 6:01 | e.g. 5×1000 m at ~3:50 |
| Repetition (105-120%) | 3:36 → 3:14 | 5:47 → 5:12 | 200-400 m reps |

Regression checks for the unit test suite (same formulas):

| Performance | expected VDOT |
|---|---|
| Half marathon 1:29:10 | 51.53 |
| Marathon 3:05:30 (same athlete) | 51.66 (round-trip consistency; ±0.2 acceptable) |
| 10K 44:24 | 45.98 |
| 5K 21:24 | 46.01 |
| 1500 m 4:00 | 70.10 |
| Marathon 4:00:00 | 37.90 |
| 5K 27:00 (CassioMaciel README example) | 34.96 |

## 6. Edge cases and extrapolation limits

1. **Distance range.** The model is fitted for ~1500 m through marathon. Below 1500 m the
   velocity-oxygen-cost linearity and >100% %max handling degrade (800 m/mile race distributions
   differ); above marathon there is no Daniels table — do not extrapolate to ultras.
2. **%max asymptote.** `%max(t) → 0.80` as t → ∞, but real slow-paced performances occur at lower
   fractions. For performances slower than roughly 4:30-5:00 marathon-equivalent, formula-derived
   VDOT drifts low and predicted M-pace becomes optimistic. Daniels' own tables span VDOT 30-85
   (tlgs embeds exactly this range); reject/flag inputs outside VDOT ~20-85.
3. **Slow-runner marathon adjustment.** Implementations carry a heuristic for low-VDOT marathoners
   (st3v uses VDOT < 39): the implied marathon %max approaches the asymptote and M-pace from race
   inversion is unreliable; consider capping M-pace band (75-80%) or flagging low confidence.
4. **Table quantization.** Daniels' printed tables quantize (VDOT to 0.1, paces to ~1 s/km, times
   to whole seconds); formula output is continuous. Expect and tolerate ±1-3 s/km differences vs
   any printed table or calculator that embeds one.
5. **Conditions.** Formulas assume flat, sea-level, cool, still-air road/track racing. Heat,
   altitude, hills and trails invalidate race-equivalence math — scale by RPE/HR instead.
6. **Fitness vs potential.** VDOT summarizes *current* fitness from a *recent* performance
   (same training block). Do not mix performances across fitness phases; recalibrate after
   meaningful fitness changes (mirrors the knowledge base's threshold-recalibration rule).
7. **Short races + rounding.** For t < ~5 min the third exponential term dominates %max; never
   "optimize away" that term (see the `-1.92885` typo trap in §1.2).
8. **No tables in the repo.** Ship the formulas and generated numbers only; do not copy Daniels'
   printed pace tables or the V.O2 calculator's output lists (https://vdoto2.com/calculator is his
   official tool — link it for users, don't replicate its assets).
