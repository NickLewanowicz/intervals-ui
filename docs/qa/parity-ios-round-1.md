# Parity round iOS-1 — bring-up + first comparison

Date: 2026-10-25/26 · Persona: qa-parity · Target: `intervalscoach.app`
(Release sim build, JS bundle baked, PB pockethost + worker endpoints
compiled in) on `intervals-iphone` (iPhone 17 Pro class, iOS 26.3, 402×874
CSS @3x = 1206×2622 px).

**Verdict: NO SIGN-OFF. iOS capture set BLOCKED by a host-level macOS
simulator fault (details below). Web baseline for the iOS comparison IS
captured and committed; the iOS half is turnkey via `tools/parity_ios.sh`
once the host is restarted.**

## Bring-up timeline (what blocked how long)

| When | Attempt | Result |
|---|---|---|
| 23:14 | `idb_companion` + `idb connect` | OK |
| 23:15→23:40 | `simctl install` (in flight before round start) | hung, killed at ~25 min |
| 23:40 | `simctl install` retry | hung, killed at ~6 min |
| 23:42 | `idb install` | symlinked bundle into `fbsimulatorcontrol/idb-applications`, then stalled — app never committed to `Containers/Bundle/Application` |
| 23:53 | device reboot (`shutdown` + `boot`) | boot fine; install still hung |
| 00:05 | **kill -9 stale `CoreSimulatorService`** (running since Oct 24 17:24 — 2 days old) + reboot device | service respawned fresh; install still hung |
| 00:16 | guest-side `launchctl kickstart -k` of `com.apple.CoreSimulator.bridge` | bridge restarted; install still hung |
| 00:33 | **`simctl erase`** + fresh first boot | first boot completed 00:49 (home screen verified by screenshot); install still hung |
| 00:35 | GUI boot via `open -a Simulator` | install still hung |
| 00:22 / 01:0x | killed stale `SimLaunchHost` (survives device reboots!), fresh boot spawned a new one (verified new PIDs) | install still hung |
| 01:0x | `launchctl kickstart -k` of CoreSimulator XPC jobs | "could not find service" — XPC services are not launchd jobs; not controllable |
| 01:0x | kill root-owned `simdiskimaged` (PID 62427, Oct 24 — only surviving process of the broken era) | **operation not permitted (needs sudo)** |

### Fault signature (evidence in `qa-screenshots/parity/ios/bringup-evidence-*`)

- DEAD (host→guest MIG path): `simctl install`, `listapps`, `ui appearance`,
  `openurl`, `idb install`, `idb ui` (HID — a full-screen swipe changes 0
  pixels).
- ALIVE (launchd-direct): `simctl boot/shutdown/erase/list`, `io screenshot`,
  `spawn` (guest binaries run).
- `sample` of the hung `simctl`: stuck in
  `-[SimDevice installApplication:] → _sendBridgeRequest →
  host_support_mig_install_app → mach_msg` (evidence 05).
- `sample` of the guest `CoreSimulatorBridge`: idle in its run loop — the MIG
  request never arrives (evidence 04).
- `xcrun simctl spawn <udid> <app binary>` runs the process but renders
  nothing (no install context) — install-less stopgap not viable (evidence 02).

### Required fix (owner: user)

**Restart the Mac** (clears user-launchd XPC state and the root-owned
`simdiskimaged` from the Oct 24 session). After restart:
`tools/parity_ios.sh` performs the whole round unattended (~15 min including
coach streaming). Optionally first `sudo killall simdiskimaged` and
`launchctl kickstart -k` the CoreSimulator service — but a restart is the
verified-reliable path given everything above failed.

## Verdict table

Flows are the web/emu parity set; "iOS" = sim capture; "web" =
`qa-screenshots/parity/web/ios-comparison/` (402×874 @3x — same pixel
dimensions as `simctl io screenshot`, eyeball-comparable 1:1).

| Flow step | iOS | Web (ios-comparison) | Verdict |
|---|---|---|---|
| 00 first launch (native → sign-in) | BLOCKED | n/a (web has marketing at `/`) | pending |
| 02 sign-in filled | BLOCKED | `02-sign-in-filled.png` | pending |
| 03 calendar-week (post-login) | BLOCKED | `03-calendar-week.png` | pending |
| 04 week-top (hero + pills + day cards) | BLOCKED | `04-week-top.png` | pending |
| 05 week-pill-selected | BLOCKED | `05-week-pill-selected.png` | pending |
| 06 sheet-open (DetailSheet, mobile) | BLOCKED | `06-sheet-open.png` | pending |
| 06b day route (Open full → /calendar/day) | BLOCKED (deep link `intervals://calendar/day` ALSO untestable: `openurl` is one of the wedged verbs — flagged below) | `06b-day-route.png` | pending |
| 07 sheet drag / X close | BLOCKED | `07-sheet-drag-result.png`, `07b-sheet-x-closed.png` | pending |
| 08 month + selection panel below grid | BLOCKED | `08-calendar-month.png`, `08b-month-day-panel.png`, `08c-month-panel-runs.png` | pending |
| 09–11 coach empty → streamed → done (transport chip) | BLOCKED | `09-coach-empty.png`, `10-coach-reply-streamed.png`, `11-coach-reply-done.png`, `11b-coach-chat-bottom.png` | pending |
| 12 settings (+ scrolled) | BLOCKED | `12-settings.png`, `12b-settings-scrolled.png` | pending |
| 13 sign-out | BLOCKED | `13-sign-out.png` | pending |
| light pass (in-app theme override, restored) | BLOCKED | `light-04…light-12` (6 shots) | pending |

Content day for this round: **Monday 26** (live week Oct 26–Nov 1; the old
`Thursday 22` convention is stale). Both scripts take `PARITY_DAY` /
`DAY` — re-derive when the week rolls.

## Static checks that COULD be done without the sim (all PASS)

- **Deep-link registration**: built
  `ios/intervalscoach/Info.plist` has `CFBundleURLSchemes = [intervals,
  com.anonymous.intervalscoach]`; route `app/(app)/calendar/day.tsx` exists,
  so expo-router should map `intervals://calendar/day`. Runtime probe still
  required (was impossible — `openurl` wedged).
- **Safe areas**: `react-native-safe-area-context` insets consumed at the
  three risk points — floating tab bar `bottom: layout.tabBarBottom +
  insets.bottom` (`app/(app)/_layout.tsx`), coach header
  `paddingTop: insets.top + spacing.sm + 2` (`app/(app)/coach/index.tsx:682`,
  the round's header fix — present for iOS too), chat scroll tail
  `paddingBottom: insets.bottom + …` (coach `:816`). expo-router ships
  `SafeAreaProvider` (verified in `node_modules/expo-router/build/ExpoRoot.js`).
- **Keyboard**: `KeyboardAvoidingView behavior='padding'` present for iOS in
  coach chat, coach sessions, and sign-in. The web shot
  `11b-coach-chat-bottom.png` shows the input clear of the tab bar; the iOS
  shot with the keyboard up remains the key runtime check (todo when unblocked).
- **Status bar**: `expo-status-bar` style tracks the palette at the root
  (`app/_layout.tsx` `Chrome()`), no overlap-prone custom header except the
  coach GlassBar (inset-padded, above).

## Bugs filed this round

None — no iOS UI evidence exists to justify a diff, and persona rules forbid
padding the report with speculation. The one environmental defect (this
host's wedged simulator MIG path) is documented above with the verified
repair.

## Fixes applied

No code changes in `apps/expo` (nothing observable to fix). Tooling added:

- `tools/parity_ios.sh` — full iOS capture flow (idb describe→tap, never
  blind-tap; dark main pass via `simctl ui appearance dark`; light pass via
  the in-app **Theme Light** button with **Theme System** restore; deep-link
  probe `intervals://calendar/day`; coach send + stream waits; keyboard-up
  chat-bottom check `11b`).
- `tools/parity_web_ios.cjs` — web baseline at 402×874 @3x (26 shots,
  committed under `qa-screenshots/parity/web/ios-comparison/`).

`docs/TESTING.md` updated with the exact iOS build/install chain
(prebuild → brew pod → `xcodebuild -sdk iphonesimulator` → `simctl
install/launch`) and the pod/ruby/wedge gotchas.

## Re-run after host restart

```sh
tools/parity_ios.sh    # installs + launches + captures the full set
# then re-derive parity verdicts in this file and, if clean:
# PARITY: SIGN-OFF (ios round 1)
```

Hard rules honored: no settings saves except the temporary theme toggle
(restored by the script), no intervals.icu writes (coach message is a read
digest ask; dev-user PB only), creds only ever read from
`.scratch/dev-user.txt` at runtime, no cred strings in artifacts.
