# ADR-0004 — Value-tier flash model default, eval-gated changes

Date: 2026-10-24 · Status: Accepted

## Context

BYO-key chat app; users feel a bad tool call more than 2 IQ points. Research
snapshot 2026-10-24 (`docs/research/openrouter-models-brief.md`): the value
tier is genuinely frontier-adjacent — claude-haiku-5.5 ($0.10/$0.50, best
tool-call reliability), glm-5.3-flash ($0.15/$0.50, best agentic index,
mandatory reasoning → pin `low`), deepseek-v4.1-flash-1017 ($0.15/$0.60 —
use the Oct-17 snapshot ID, the base ID is a weaker Sept build), gpt-5.6-luna
($0.20/$1.20), kimi-k3.1-pro ($2/$10, escalation tier only).

## Decision

- **Default: `z-ai/glm-5.3-flash`** with `reasoning.effort: "low"` pinned —
  the value/agency sweet spot the product wants; reasoning tokens would
  silently ~1.5–2× output cost otherwise.
- Roster (user-selectable in Settings): glm-5.3-flash (default),
  claude-haiku-5.5, deepseek-v4.1-flash-1017. Escalation tier (kimi-k3.1-pro)
  is a future setting, not a default.
- Every OpenRouter call sets `provider.require_parameters: true` (tool support
  is per-endpoint; never route to one without).
- **Default-model changes require eval numbers** from
  `tools/eval_prompts.mjs` (≥3 fixtures × both models) appended to
  `docs/research/eval-log.md`. Baseline 2026-10-24: glm-5.3-flash 3/3 PASS,
  claude-haiku-5.5 3/3 PASS (harness + fixtures seeded).

## Consequences

- Prompt iteration is cheap and safe (fixtures catch contract breaks); the
  coach-tuner persona owns this loop.
- Cost per typical turn ≈ $0.005–0.010 (50k in / 5k out, partially cached).
