# Testing

Pattern inherited from the viet-study practice project: pure logic is
unit-tested + mutation-guarded where cheap; network surfaces hide behind
injectable seams; anything visual is verified by the visual-reviewer persona
against the deployed app (vision-capable sessions only).

## Layers

| Layer | Where | Tool | Gate |
|---|---|---|---|
| Domain math + validators | `packages/core/tests/` | vitest | every commit (pre-commit + CI) |
| Coach context digests | `apps/worker/tests/` | vitest | every commit |
| App pure logic (SSE parser, date windows, stores) | `apps/expo/src/**/__tests__/` | vitest (node env) | every commit |
| Prompt contract | `packages/core/tests/prompts.test.ts` | vitest | every prompt change |
| Prompt/model quality | `tools/eval_prompts.mjs` + `.scratch/evals/fixtures/` | real OpenRouter calls | before any prompt/default-model ship (coach-tuner) |
| Live API smoke | curl against the deployed Worker | manual/scripted | after deploys: health, sync, chat |
| Visual/UX | visual-reviewer persona, deployed app | playwright + eyes | per review round (vision sessions) |

## Non-negotiable test rules

1. **No live intervals.icu writes from tests. Ever.** Evals and tests mock or
   validate in memory (AGENTS.md non-negotiable #2). The only code path that
   writes is the Worker's apply route, exercised by the user approving a
   proposal.
2. Network seams (`IntervalsClientOptions.fetchImpl`, PB REST via functions)
   are injectable — tests never hit pockethost.
3. `pnpm test` must pass with zero network access.

## Adding coverage

- New pure function → co-located test in the owning package.
- New prompt behaviour → new fixture in `.scratch/evals/fixtures/` + an
  assertion in `prompts.test.ts` that the behaviour is TAUGHT (string-level).
- New endpoint → extend the worker digest tests for context building; happy
  path of routing is smoke-tested post-deploy.

## Native (Android) parity QA

- Build: `cd apps/expo && npx expo prebuild --platform android --no-install && cd android && JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=~/Library/Android/sdk ./gradlew assembleRelease` → `app/build/outputs/apk/release/app-release.apk` (signed with the machine's debug keystore — keep using the same machine for update installs).
- Install: `adb install -r <apk>` on a running emulator/device.
- Parity captures: `tools/parity_shots.sh all` (emu via uiautomator + web via playwright) → `qa-screenshots/parity/{emu,web}/`, then the qa-parity persona compares (docs/qa/parity-round-N.md). Parity sign-off round 1: docs/qa/parity-round-1.md.
