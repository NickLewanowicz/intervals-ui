# Subagent personas

Codified expertise for the AI-driven team (see repo-root `AGENTS.md` for the
working agreement). Dispatch via the Agent tool with `subagent_type:
general-purpose` after having the persona read its definition file, or work
them inline in a session that shares this repo.

| Persona | File | Owns |
|---|---|---|
| ui-builder | `ui-builder.md` | Expo app implementation from issues |
| coach-tuner | `coach-tuner.md` | Prompt iteration + model evals (real OpenRouter calls) |
| visual-reviewer | `visual-reviewer.md` | The visual QA gate (vision-capable sessions only) |

The **Maintainer** (primary agent / orchestrator) owns scope, sequencing, and
acceptance; it dispatches these personas and verifies their output against the
Definition-of-done sections in each file.

All screenshot captures from any persona route through the screenshot registry
(`node tools/shot_registry.mjs capture …` — docs/TESTING.md "Screenshot
registry"): timestamped + commit-stamped files, a machine-readable
`index.jsonl`, and a `latest/` view anyone can watch for visual progress.
