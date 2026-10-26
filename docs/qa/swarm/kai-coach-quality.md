# Kai — Coach-Quality Review (QA swarm, round: coach-quality)

- **Persona:** Kai — exercise-science-literate runner judging advice quality
- **Date:** 2026-10-26 · **Platform:** web (QA stack, 127.0.0.1:8788) · **Theme:** light
- **Account:** qa-racer (credentials not reproduced here; seeded by `tools/qa_seed_personas.mjs`)
- **Model:** `z-ai/glm-5.3-flash` via the app's on-device transport (ADR-0006) → intercepted by the driver and proxied to the QA mock worker's real-LLM proxy (127.0.0.1:8099), worker-enforced budget **$0.35**. **Spend: $0.0122 incl. probes — budget never hit; all 6 turns were real model output** (canned-fallback detector never fired).
- **Driver:** `/Users/nick/Documents/Projects/intervals-ui/.scratch/swarm/kai/driver.mjs` — one session (`rnktwohy6nb74tz`), six sequential turns, every proposal **dismissed** (never approved; nothing written to any calendar).
- **Transcript:** `/Users/nick/Documents/Projects/intervals-ui/.scratch/swarm/kai/out/transcript.md` (+ `results.json`, 11 registry captures under `qa-screenshots/registry/…/kai/`).

## Grounding baseline (what the coach could honestly know)

Seeded QA mirror for qa-racer (verified directly in PocketBase):

| Artifact | Values |
|---|---|
| Events | RACE_B "Parkrun tune-up" 10-19 (planned 5k/21:30) · Easy 6km 10-26 · **6×800m Z5 Tue 10-27** · **Threshold 4km Thu 10-29** · **Long run 16k Sun 11-01** · **RACE_A "Goal 10K — sub-42" 11-16** · nothing scheduled 11-02→11-15 |
| Activity | Parkrun 10-19: 5.0km in **21:05** (1265s), pace 4:13/km, avg HR 172, `race=true` |
| Wellness (only 3 rows: 10-24/25/26) | CTL 48.9→49.1→49.3 · ATL 46.2→47.5→48.0 · **HRV 62→61→63** · RHR 48→48→47 · sleep 7.4/7.1/7.6h |
| Computed by `@intervals/core` (verified by running the actual code) | VDOT **46.8** → easy **5:10–6:11**, threshold **4:29–4:42**, interval **4:03–4:13** /km · 10K equivalent at 46.8 = **43:44** · sub-42 needs VDOT ≈ **49.0** (48.5 → 42:25) |
| Digest ids | calendar digest prints `#100…#105`; 6×800 = **#102**, threshold = **#103**, long run = **#104** |

Note: `sport_settings` is empty for this persona and the activity row's `threshold_pace`/`lthr` did not survive seeding (columns not in the PB schema) — so the only honest pace anchor is the VDOT digest from the parkrun. A coach quoting a "threshold pace from your zones" would be hallucinating.

## Per-turn review

### Turn 1 — "I want to go sub-42 at my 10K in three weeks. Am I on track?" (`turn-a-grounding`)

**Grounded:** Yes, heavily. Cited VDOT 46.8 from the 10-19 parkrun, wellness ("form +1, fitness 49, fatigue 48, HRV steady at 61–63"), the computed week totals ("last week 5km planned/actual, this week jumps to 39km/3h18/load 229" — exactly the digest's computed totals line), and — unprompted — the calendar hole 11-02→11-15 with a taper shape. It then proposed a 5-change down-week **bundle** through the steered modal ("one call per day so you can steer each session") — correct protocol.

**Errors:** Three small numeric drifts, all in the athlete's favor: parkrun "21:00" (actual 21:05 — but the digest itself only displays whole minutes, so this is a faithful-but-lossy quote), equivalent 10K "around 43:20" (computed: **43:44**), and "sub-42 needs roughly VDOT 48.5" (needs ≈ **49.0**; 48.5 gives 42:25). Notably, every number the digest *pre-computed* was quoted exactly; the only errors are in the two numbers the model had to *derive* (goal VDOT, goal-equivalent).

**Method/tone:** Honest plan-A/plan-B framing (42:30 fallback), flags the 5km→39km spike. Good. **Verdict: A−**

### Turn 2 — "Design the key sessions for the next two weeks." (`turn-b-sessions`)

**Grounded/method:** 10K-correct progression from the athlete's actual pace bands: 5×1000 at 4:03–4:13 (interval band, verbatim), threshold retained at 4:29–4:42, long run 14k with 2k fast finish, explicit "no third hard day," down week then taper with last quality (3×800 at goal 4:10–4:12) 6 days before the 11-16 race and a shakeout the day before. 80/20 anchor respected (2 quality days + long run, intensity mix kept while volume drops). Proposed a clean 4-change bundle with per-item steering.

**Errors:** The proposal **contradicts its own numbers**: bundle summary says "volume cut ~20%" but its four sessions total **38.5km vs this week's 39km** (≈flat), and the prose claimed "~34km." Also, turn 1's dismissed bundle had different sessions for the same week (4×1k/11k long run) — the re-design was never acknowledged, it silently re-proposed. **Verdict: B+**

### Turn 3 — "Should I do the long run or the intervals this weekend?" (`turn-c-weekend`)

**Grounded:** Best calendar use of the run: resolves the false dilemma with dated facts — "the 6×800 is Tuesday 10-27 (#102) and the 16k long run is Sunday 11-01 (#104)" — citing the **exact seeded event ids**. Correct hard/easy reasoning (long run counts as a hard day), and if forced to pick one, correctly prioritizes race-pace work 3 weeks out with a sensible "shorten, don't skip" long-run fallback and a back-to-back caution. **Verdict: A**

### Turn 4 — "My HRV dropped 10 points overnight." (`turn-d-hrv`)

**Grounded/caution:** Textbook. Did **not** confirm the fabricated drop — cited the real trend "10-24 to 10-26: 62 → 61 → 63," refused to re-plan off one reading, gave a concrete decision rule tied to tomorrow's scheduled 6×800 (#102), and stated the two-consecutive-days back-off rule. No medical advice, no overreaction, no underreaction ("What I won't do…" paragraph is exactly the right coach voice). **Verdict: A**

### Turn 5 — "What pace should my threshold run be?" (`turn-e-threshold-pace`)

**Grounded:** "Your threshold zone is 4:29–4:42/km (from your current VDOT 46.8, anchored on the 21:00 parkrun)" — **matches the core library's computed band to the second** (this is the honest derivation, since the athlete has no synced zone settings). Anchored to Thursday's #103 session, placement-aware (between Tuesday's intervals and the weekend long run), RPE + "comfortably hard" talk-test, and the moderate-intensity trap straight from the 80/20 knowledge base. **Verdict: A**

### Turn 6 — "Summarize my fitness trend this month." (`turn-f-trend`)

**Grounded:** The anti-hallucination turn: "my wellness data only starts 10-24, so I have three days of metrics, not a full month." Then quotes the seeded values exactly — CTL 49 flat, ATL 46→48, form +3→+2→+1 (the digest's own rounding), HRV 62→61→63 — connects to the week totals (39km vs 5km), keeps continuity with turn 4's claim without validating it ("treat as noise unless it repeats"), re-anchors on the VDOT 46.8 race result, and asks for older data instead of inventing it. **Verdict: A**

## Hallucination ledger

| Claim | Reality | Severity |
|---|---|---|
| 10K equivalent "around 43:20" | 43:44 (computed) | minor — flatters the athlete |
| Sub-42 "needs roughly VDOT 48.5" | ≈49.0 (48.5 → 42:25) | minor — understates the gap |
| Parkrun "21:00" | 21:05 (digest shows whole minutes only) | cosmetic — faithful to context |
| Turn-2 bundle "volume cut ~20%" | 38.5km vs 39km this week | **moderate** — the one real methodology slip |
| Everything pre-computed in the digest (VDOT, pace bands, week totals, form, HRV, event ids #102–#104) | quoted verbatim, verified against `@intervals/core` | — |

No invented workouts, no fabricated wellness numbers, no medical advice, no phantom calendar entries. The steered-writes protocol was honored end to end (2 bundles proposed via modal, both dismissed; 0 calendar mutations).

## Infra / harness notes (affected the run, not the grade)

1. **Re-arm incident:** the armed proxy died mid-setup (an external stack restart at ~16:53 and again ~20:50 came up **without** `QA_REAL_LLM_KEY`; `qa_stack.sh start` never arms the proxy). Run 1 degraded to canned replies; I re-armed the worker from root `.env` (`OPENROUTER_API_KEY` → `QA_REAL_LLM_KEY`, budget 0.35) and re-ran all 6 turns. Evidence of the degraded run preserved in `.scratch/swarm/kai/out-degraded-run1/`.
2. **Worker robustness:** the log shows the original armed worker died in a double-start (`EADDRINUSE`) — `qa_stack.sh` has no PID lock.
3. **Proposal-row loss (stack contention):** run 2's two proposal bundles rendered and were dismissed, but `proposals` rows are absent from PB afterward, leaving 9 stale "pending" inline cards in the final screenshot. A manual create-as-racer → dismiss-via-worker repro **does** persist (`status=dismissed`), so the normal flow works; the wipe matches concurrent stack manipulation (a second persona's sessions/"Easy mock run" proposal appear at 20:55–21:03 on the same account). Recommend per-persona PB isolation or a stack lock.
4. Budget math at this prompt size (~8k tok/turn in, model streams reasoning invisibly): ~$0.002/turn — the $0.35 cap supports ~150 turns, so "budget hit" fallbacks are effectively impossible for persona-sized runs; the canned detector in the driver (`results.json`) is the tripwire regardless.

## Overall grade: **A−**

Grounded on every turn, methodologically sound 80/20 with a correct 10K taper, exactly the right caution profile on the HRV trap, zero dangerous or unfounded claims. Held below A by derived-number drift (43:20 / VDOT 48.5) and the turn-2 bundle contradicting its own "down week" summary.

### Top 3 prompt/pipeline improvements

1. **Pre-compute the goal math in the pipeline, not the model.** The coach quoted every digest-computed number verbatim and erred only on the two it derived itself (goal VDOT, goal-distance equivalent — the most load-bearing numbers of the whole conversation). Extend `vdotDigest` to include the exact anchor-race time (not whole-minute), the current 10K/HM equivalent, and — when a goal race exists in the calendar digest — "goal X needs VDOT Y; you're at Z," all computed by `@intervals/core`. The prompt already says "quote these, do not re-sum."
2. **Proposal-bundle consistency guard.** Turn 2's bundle summary ("volume cut ~20%") was false against its own sessions (38.5km vs 39km) and the prose (~34km), and it silently superseded turn 1's dismissed bundle. The pipeline already computes weekly totals: validate each propose_event bundle's summed volume against the athlete's current week and the model's stated rationale at `validateProposal` time, and attach a warning (or surface it in the modal: "this bundle = 38.5km, +1% vs this week — labeled as a down week") before the athlete approves. Also consider feeding dismissed proposals back as a one-line system note so a re-design is explicit.
3. **Harden the QA stack for concurrent personas.** `qa_stack.sh start` silently drops the real-LLM arming (restart = canned replies with no signal), the worker double-starts into `EADDRINUSE`, and shared PB state got trampled mid-run (proposal rows wiped by another agent's session; stale "pending" cards in the UI). Fix: `start` reads `OPENROUTER_API_KEY` from `.env` and exports `QA_REAL_LLM_KEY`/`QA_REAL_LLM_BUDGET_USD` itself, adds a PID-file lock + health check, and gives each persona account/collection isolation (or one stack per agent).

— Kai, coach-quality round. All work against the QA stack (127.0.0.1); production untouched; no intervals.icu writes; every proposal dismissed.
