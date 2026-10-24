# Training knowledge base — summary

`packages/core/src/prompts/knowledge.ts` exports `TRAINING_KNOWLEDGE` (a markdown string) and `TRAINING_SOURCES`. It is embedded in the AI coach's system prompt and is the sole source of general training doctrine the coach uses.

## What it covers

- **Intensity zones and the 80/20 principle** — physiological definitions of low/moderate/high intensity (VT1 and VT2 boundaries, with talk-test / 6-minute-test estimation), the elite 80/20 intensity-distribution finding, the "moderate trap" most recreational runners fall into, and how the three intensity bands map onto 5-zone and 7-zone HR/pace models like intervals.icu's.
- **Weekly structure** — hard/easy alternation, the three-hard-day microcycle, easy-run discipline, long-run role and variants, strides/drills/hill reps, when doubles make sense, relative vs absolute rest, 3-week step cycles.
- **Plan architecture by distance** — cycle lengths for 5K through marathon, base → build/peak → taper progression, which workout types dominate each phase per event, volume-ramp guardrails (acute vs chronic load), and taper specifics per distance.
- **Race week and race day** — shakeouts, warm-up scaling with race length, even/negative pacing and the wall, fueling (when carbohydrate matters), and post-race recovery spacing.
- **Lifestyle factors** — sleep, total-stress management, nutrition habits, minimal-dose strength training, consistency, and injury red flags.
- **Seventeen numbered programming rules** that directly govern the coach's proposals (intensity caps, down-week triggers, taper rules, volume-ramp constraints, race-spacing, post-race breaks, etc.).

## Attribution and scope

The content is a **distilled principles document** derived from the project owner's personal-library copies of two copyrighted books: *80/20 Running* (Matt Fitzgerald & Robert Johnson, 2014) and *Run Like a Pro (Even If You're Slow)* (Matt Fitzgerald & Ben Rosario, 2022/2024). Facts and methods are rewritten entirely in original wording — no passages, tables, or distinctive phrasing are reproduced. Where the two books differ, the newer book's framing is preferred (noted in one clause). It is intended for personal, non-commercial use within this project only.
