# QA — Marcus (The Data Skeptic) · marathon-build persona

- **Date:** 2026-10-26 · **Stack:** QA only — app `http://127.0.0.1:8788`, coach mock `:8099`, PocketBase `:8090`. Production (`intervals.icu`, pockethost, deployed Pages/Workers) was never touched.
- **Account:** `qa-marathon@intervals.test` (marathon-build persona; password not reproduced here).
- **Method:** Playwright driver (headless Chromium, 1280×800, dark) at
  `.scratch/swarm/marcus/driver.mjs` — sign-in → calendar week view → previous week → tile tap (coach status sheet) → coach chat. Every number the UI showed was extracted as text and checked **outside the app** against hand-computed sums from the fixture of record, `personaData('marathon-build')` in `tools/qa_seed_personas.mjs`. Hold-flat recomputed from the Coggan 42d/7d closed forms independently.
- **Evidence:** 6 captures registered via `node tools/shot_registry.mjs` (agent `marcus`): `qa-screenshots/registry/2026-10-26/92c936f/marcus/{sign-in,calendar-week,calendar-prev-week,status-sheet,coach-initial,coach-reply}-dark-web-*.png` (+ `latest/marcus/`). Raw text dumps: `.scratch/swarm/marcus/*.txt`, `results.json`.

Ground truth for the current week (Mon 2026-10-26 → Sun 2026-11-01), from the seed: events 8.0km/2700s/30 · 9.0km/2820s/62 · 10.0km/2460s/55 · 26.0km/7500s/128 → **53.0km, 4h18m, load 275**. No activities this week. Wellness day 0: CTL 42.0, ATL 43.4, HRV 51, RHR 52, sleep 7.0h.

## Verification table

| # | Metric (surface) | UI value | Computed from fixture | Verdict |
|---|------------------|----------|----------------------|---------|
| 1 | Distance tile, planned sub (week Oct 26–Nov 1) | 53.0km | 8000+9000+10000+26000 m = 53.0km | MATCH |
| 2 | Time tile, planned sub | 4h18m | 2700+2820+2460+7500 s = 4h18m | MATCH |
| 3 | Load tile, planned sub | 275 | 30+62+55+128 | MATCH |
| 4 | Distance/Time/Load actuals (no activities this week) | — / — / — | 0 runs | MATCH (honest dashes, no fake zeros) |
| 5 | Form tile | −1, "neutral" | round(42.0−43.4)=round(−1.4)=−1; band neutral | MATCH |
| 6 | Mon 26 card | 8.0km · 45m · load 30 | 8000m · 2700s · 30 | MATCH |
| 7 | Tue 27 card | 9.0km · 47m · load 62 | 9000m · 2820s · 62 | MATCH |
| 8 | Thu 29 card | 10.0km · 41m · load 55 | 10000m · 2460s · 55 | MATCH |
| 9 | Sun 1 card | 26.0km · 2h05m · load 128 | 26000m · 7500s · 128 | MATCH |
| 10 | Wed 28 / Fri 30 / Sat 31 | Rest day | no seeded events | MATCH |
| 11 | Prev week (Oct 19–25) distance actual / planned | 32.0km / 32.0km | 24100+7900=32000 / 24000+8000=32000 | MATCH |
| 12 | Prev week time actual / planned | 2h41m / 2h40m | 6950+2720=9670s / 6900+2700=9600s | MATCH |
| 13 | Prev week load actual / planned | 148 / 148 | 118+30 both sides | MATCH |
| 14 | Long run 24k actual card | 24.1km · 1h55m · HR 148 · load 118 | 24100m · 6950s · 148 · 118 | MATCH |
| 15 | Long run PACE | 4:49/km | 6950s ÷ 24.1km = 4.806 min/km = **4:48/km** | **MISMATCH +1s/km** (see F1) |
| 16 | Easy aerobic actual card (Tue 20) | 7.9km · 45m · HR 138 · load 30 | 7900m · 2720s · 138 · 30 | MATCH |
| 17 | Easy run PACE | 5:45/km | 2720s ÷ 7.9km = 5.738 min/km = **5:44/km** | **MISMATCH +1s/km** (see F1) |
| 18 | Tue 20 day header | "2 runs · 15.9km · load 60", one card MISSED (8.0km/30) + one DONE (7.9km/30) | One real session; values sum correctly (8.0+7.9, 30+30) but it is counted twice | DOUBLE-COUNT (see F2) |
| 19 | Status sheet lead sentence | "You're at 0 of 275 planned load" | 0 actual / 275 planned | MATCH |
| 20 | Status sheet hold-flat | ≈307/wk | loadToHoldFlat(42.0, 43.4) = 306.81 → 307 | MATCH |
| 21 | Status sheet clause | "the week sheds more than it loads" | planned 275 < hold 307−2 | MATCH (correct branch) |
| 22 | Status sheet form | "−1 (neutral), steady" | −1.4 → −1; no 7-row delta possible (4 wellness rows) → "steady" | MATCH |
| 23 | THE GAP chips | Hold-flat 307/wk · You 275 · Gap +32 | 307−275 = 32 | MATCH |
| 24 | FITNESS tiles | CTL 42.0 · ATL 43.4 | seed day 0 | MATCH |
| 25 | RECOVERY 7-day | HRV 54.0 · RHR 51 · Sleep 6h51m | avg(58,55,52,51)=54.0 · round(avg(50,51,52,52))=51 · avg(7.2,6.8,6.4,7.0)=6.85h | MATCH |
| 26 | Zone balance section (week of 0 actuals) | absent | zoneSeconds empty → omitted, not dashed | MATCH (honest) |
| 27 | Coach reply: planned km | "You're at **38km** planned" | **53.0km** (tiles + fixture) | **MISMATCH** (B1) |
| 28 | Coach reply: load | "**a load of 142**" | **275** (tiles + fixture) | **MISMATCH** (B1) |
| 29 | Coach reply: week shape | "three easy runs, one interval session Tuesday, long run **Saturday**" | 4 runs: 1 easy+strides, 2 quality (Tue/Thu), long run **Sunday** Nov 1 | **MISMATCH** (B1) |
| 30 | Coach reply: session day | "interval session Tuesday" | Tue run club 8×(2′ Z4/2′) | MATCH (the only number-adjacent claim it got right) |
| 31 | Mon 26 intensity tag | "Intervals" | "Easy aerobic + strides" is an easy run | **WRONG** (B2) |
| 32 | Tue 27 intensity tag | "Easy" | "Run club — 8×(2′ Z4 / 2′ easy)" is the interval session | **WRONG** (B2) |

## Verdicts per surface

| Surface | Verdict |
|---|---|
| Sign-in | PASS — clean login; one transient "Could not sign in" traced to the local PB being mid-reseed (infra, not the app) |
| Calendar · week view | PASS on all 13 numeric checks; FAIL on intensity tag chips (2 mislabels) |
| Calendar · previous week | PASS on all rollups and per-run cards; two 1s/km pace artifacts; one missed/done double-count |
| Stats hero tiles | PASS — Distance/Time/Load/Form all exact, honest "—" for zero actuals |
| Tile tap → coach status sheet | PASS — every number (load, hold-flat, gap, CTL/ATL, HRV/RHR/sleep) reproduces by hand; internally consistent with the tiles |
| Coach chat | **FAIL** — four wrong claims in one sentence; contradicts the tiles it sits two tabs away from |

## Findings

**LIKED**
- L1 (low, positive): Zero-actual tiles show "—", the zone section disappears when there's no time-in-zone, and estimates keep their ≈. Nothing is fabricated — this is the single biggest credibility win in the app.
- L2 (low, positive): The deterministic status sheet is exactly what it claims: I recomputed hold-flat (306.81→307), gap (+32), and all recovery averages by hand and everything matches to the displayed precision.

**BROKEN**
- B1 (high): Coach chat invents numbers. Asked "What's my total planned load this week?" it answered 38km / load 142 against tiles showing 53.0km / 275, plus a wrong schedule (3 easy runs, long run Saturday). Root cause (found with source access, but visible black-box as pure contradiction): the QA mock `tools/qa_mock_worker.mjs` `Reply()` returns canned copy that ignores the seeded context. Production may ground the prompt, but the QA harness currently cannot prove the coach quotes real data — and a contradiction here is the fastest possible trust kill.
- B2 (medium): Intensity tags are name-keyword guesses that misfire both ways (`apps/expo/src/lib/week-view.ts` `TAG_RULES`): the `/interval|…|\d\s*[x×]\s*\d|strides?/` rule tags "…+ strides" as **Intervals**, and the ×-rule fails the canonical "8×(2′ …)" format so the real interval session falls through to the `easy` word-match and gets tagged **Easy**. Wrong direction on both = a coached athlete stops believing the labels.

**CONFUSING**
- C1 (medium): Tue Oct 20 renders one real session as "2 runs": the planned event is badge MISSED while an identical same-morning activity is badge DONE, and the day header counts both (15.9km, load 60). The app merges only on explicit `paired_event_id`; the fixture leaves it null. Real intervals.icu data pairs, but any unpaired import will double-count a person's week — with no fuzzy same-day/name fallback.
- C2 (low): Day-card rollup "2 runs 48.1km" mixes planned + actual meters (24.0+24.1). The arithmetic is right; the semantics ("48.1km run on Monday") are not what happened.

**WISH**
- W1 (low): Pace cells should be recomputed from distance ÷ time (or the stored pace carried at full precision). Both seeded runs display +1s/km (4:49 vs true 4:48.4 from 24.1km/1h55m50s; 5:45 vs 5:44.3) because the fixture's pace field is pre-rounded to 2dp and `formatPace` rounds again. Trivial, but it's exactly the double-rounding a skeptic checks first.
- W2 (low): A single "hero → coach" consistency assertion in the QA harness (parse the reply, diff against `weeklyStats`) would have caught B1 automatically.

**Environment note (not app defects):** (1) the long-running mock worker on :8099 predated the CORS fix now on disk (`qa_mock_worker.mjs` OPTIONS catch-all) — preflights 404'd and coach chat was dead from the web app until I restarted it with current code; anyone re-running this swarm must restart the mocks. (2) One transient sign-in failure while PB was mid-reseed.

## Bottom line

**Would I trust this app's numbers?** The deterministic path — calendar, hero tiles, and the status sheet — yes, without reservation: 22 of 26 numeric checks reproduced exactly, and the 4 misses are display-layer artifacts (2× pace double-rounding) or fixture pairing gaps, not bad math. The AI coach, no: it quoted a week that does not exist (38km/142 vs 53km/275), and an AI that invents numbers next to a calculator that is right is worse than either alone.

**The single fix that would most increase trust:** make the coach quote the same computed values the tiles render — in the QA stack, have the mock worker derive its reply from the seeded `weeklyStats` (and in production, guarantee the worker injects those exact numbers into the prompt context). The moment the coach said "275", every other surface's credibility would transfer to it.
