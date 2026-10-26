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

## Native (iOS) build + parity QA

Proven chain on this machine (Xcode 26.3 / iOS 26.3 sim runtime, RN 0.8x + Expo SDK 54-ish with pods):

```sh
# 1) native project (ios/ dir is committed; re-run only after native deps change)
cd apps/expo && npx expo prebuild --platform ios --no-install

# 2) pods — MUST be the Homebrew pod; /usr/local/bin/pod is a stale x86 1.11.3
#    install that dies on "Ignoring ffi-1.15.5 because its extensions are not
#    built". Brew pod 1.17.0 works (homebrew ruby 4.0; no bundler needed).
/opt/homebrew/opt/cocoapods/bin/pod install          # run inside apps/expo/ios

# 3) release simulator build (JS bundle baked; PB + worker endpoints compiled in)
cd apps/expo/ios && xcodebuild \
  -workspace intervalscoach.xcworkspace -scheme intervalscoach \
  -configuration Release -sdk iphonesimulator -derivedDataPath build/ios -quiet build
#   → build/ios/Build/Products/Release-iphonesimulator/intervalscoach.app

# 4) install + launch (device: intervals-iphone, UDID in tools/parity_ios.sh)
xcrun simctl boot 3AE59F28-6801-4426-9054-F57B20299899
xcrun simctl ui 3AE59F28-6801-4426-9054-F57B20299899 appearance dark  # app is dark-first
xcrun simctl install 3AE59F28-6801-4426-9054-F57B20299899 apps/expo/ios/build/ios/Build/Products/Release-iphonesimulator/intervalscoach.app
xcrun simctl launch 3AE59F28-6801-4426-9054-F57B20299899 com.anonymous.intervalscoach
```

Gotchas (learned round iOS-1):

- **pod**: use `/opt/homebrew/opt/cocoapods/bin/pod` (see above). The stale
  `/usr/local/bin/pod` (1.11.3, broken ffi gem) will fail mid-install.
- **ruby/jdk**: the iOS leg needs no JAVA_HOME (that's the Android gradle
  build); pods run on homebrew ruby 4.0. If gems complain, `gem pristine ffi`
  under the homebrew ruby, or just use the brew pod path above.
- **simctl wedges**: if `simctl install` / `listapps` / `openurl` hang forever
  while `simctl io screenshot` and `simctl spawn` still work, the host→guest
  MIG path is wedged (stale `CoreSimulatorService` / `SimLaunchHost` /
  root-owned `simdiskimaged`). A Mac restart clears it; killing
  `com.apple.CoreSimulator.CoreSimulatorService` + `SimLaunchHost` may not be
  enough (verified 2026-10-26). Symptom check: `sample` the hung `simctl` —
  stuck in `host_support_mig_install_app → mach_msg`.
- **UI automation**: `idb ui *` needs `idb_companion --udid <udid>` running +
  `idb connect localhost <grpc_port>` (port is in the companion log). Same
  rule as Android: locate elements via `idb ui describe --json` frames, never
  blind-tap. Full flow: `tools/parity_ios.sh`; web baseline at the same
  logical size (402×874 @3x): `tools/parity_web_ios.cjs` →
  `qa-screenshots/parity/web/ios-comparison/`.
- iOS home-screen widgets are WidgetKit (round 17): a `intervalscoachWidgets`
  app-extension target — see "iOS home-screen widgets (round 17)" below.

## iOS home-screen widgets (round 17)

Three SwiftUI WidgetKit widgets (NextRace / UpcomingRuns / Fitness) mirroring
the Android lineup. Sources live in git at `apps/expo/widgets-ios/` +
`apps/expo/modules/widget-snapshot-bridge/` (a local Expo module the APP uses
to write the snapshot JSON into the App Group and push timelines). The
generated `ios/` project must be patched after every prebuild:

```sh
cd apps/expo && npx expo prebuild --platform ios --no-install
cd ios && /opt/homebrew/opt/cocoapods/bin/pod install   # brew pod (gotcha above)
cd ../.. && tools/ios_widgets_setup.sh                  # idempotent: adds target + App Groups + embed
cd apps/expo/ios && xcodebuild \
  -workspace intervalscoach.xcworkspace -scheme intervalscoach \
  -configuration Release -sdk iphonesimulator -derivedDataPath build/ios -quiet build
# → build/ios/Build/Products/Release-iphonesimulator/intervalscoach.app
#   (+ intervalscoachWidgets.appex embedded in PlugIns/)
```

- `tools/ios_widgets_setup.sh` is the ONLY place iOS project surgery lives:
  it recreates the `intervalscoachWidgets` extension target from the
  git-tracked Swift, writes the App Group
  (`group.com.anonymous.intervalscoach`) entitlements for both targets, and
  wires app → extension dependency + embed. Safe to re-run any time; re-run
  it after every `expo prebuild --platform ios` (prebuild wipes the target).
- Data path: RN `writeWidgetSnapshot` (AsyncStorage, Android) is mirrored on
  iOS by `WidgetSnapshotBridge.write(json)` → shared
  `UserDefaults(suiteName:)` key `widget.snapshot.v1` → the extension reads
  it offline. Proof of crossing: the group plist under the simulator's
  `data/Containers/Shared/AppGroup/*/Library/Preferences/` contains the JSON.
- Placement QA: long-press home → + → search "intervals" → add each widget;
  captures in `qa-screenshots/round-17-ios-widgets/`. Countdown demo rows:
  `node .scratch/r16-mirror.mjs race-add` → relaunch app → widget shows the
  TEST race → `node .scratch/r16-mirror.mjs clean` (verify 0 remaining).
- Device (non-simulator) builds additionally need App Group provisioning —
  out of scope for the simulator QA chain above.
