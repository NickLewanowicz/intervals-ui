# Parity Round 2 — web (https://intervals.imnick.dev) vs native APK (emulator-5554)

Reviewer: qa-parity · 2026-10-25 · week view v2 (docs/design/calendar-week-v2-spec.md) + regression sweep
Method: identical signed-in flow driven on both sides, same order, both themes, fresh `pm clear` state.
- **Web**: Playwright Chromium — mobile 393×851 (dark + light) and **desktop 1280×900 (dark + light, new)**
  (`tools/parity_web.cjs` via `tools/parity_shots.sh web`).
- **Native**: release APK `com.anonymous.intervalscoach` on Pixel5 (1080×2280 @2.75x → 393dp),
  night mode YES for the dark pass, `cmd uimode night no` + relaunch for the light pass; every
  dump-visible element located via `uiautomator dump` (`tools/uidump.py`), no blind taps. RN's Android
  **Modal is invisible to uiautomator dump**, so sheet-internal taps use Pixel5-geometry coordinates
  calibrated from the captured sheet (grabber 540,829 · Open full 793,908 · X 975,908) with a screencap
  pixel check after every step (helpers `sheet_open` / `emu_open_day_sheet` in `tools/parity_shots.sh`).
- Deliberate divergence by design (spec §3): desktop web opens the **DetailSidePanel** (right, animated,
  list narrows); mobile web + native open the **DetailSheet** (bottom sheet). Each side is judged against
  its intended pattern.
- No proposal approved, no settings saved, nothing purchased. The test coach message was sent once per
  side (both sides start from "New chat" so the empty state stays comparable).

## Capture inventory (60 shots, all verified non-blank and content-correct)

| Flow step | web (mobile 393) | web (desktop 1280) | emu |
|---|---|---|---|
| 01 launch / 02 sign-in filled | ✅ / ✅ | — | ✅ / ✅ |
| 03 calendar week (auto-scrolled to today) | ✅ | — | ✅ |
| 04 week top (hero + DayStrip + day cards) | ✅ | d-01 ✅ | ✅ |
| 05 pill select (Select Thursday 22) | ✅ | — | ✅ |
| 06 sheet/panel open (+ d-02 mid-animation frame) | ✅ | d-02 ✅ + d-02-panel-anim ✅ | ✅ |
| 06b "Open full" → /calendar/day route | ✅ | d-04 ✅ (URL asserted) | ✅ |
| 07 grabber drag result | ✅ (log: drag failed → X fallback) | — | ✅ (scripted NOTE: drag failed) |
| 07b X close | ✅ | d-05 ✅ | ✅ |
| 08 + 08b + 08c month, selection panel w/ run cards | ✅✅✅ | — | ✅✅✅ |
| 09/10/11/11b coach (empty/streamed/done/bottom) | ✅✅✅✅ | — | ✅✅✅✅ |
| 12/12b settings, 13 sign-out | ✅✅✅ | — | ✅✅✅ |
| light week (top / pill / sheet / month panel) | ✅✅✅✅ | d-light-01, d-light-02 ✅ | ✅✅✅✅ |
| light coach / settings | ✅✅ | — | ✅✅ |

Round-1 captures archived untouched at `qa-screenshots/parity/round1/`.

## Verdict table

| Flow step | Verdict | Notes |
|---|---|---|
| 01 launch / 02 sign-in | **PLATFORM-OK / PASS** | Native skips marketing (by design). Same card, masked password + eye, Google-coming-soon. |
| 03 week auto-scroll | **PASS** | Both land on today's day card (Sunday 25, accent-tinted header). |
| 04 hero + DayStrip + day cards | **PASS** | Hero identical (Oct 19–25 · Today · sync chip · Week/Month pill · THIS WEEK 30.3km/2h43m/277/FORM +2 · form note · Details). Pills: weekday letter + date + markers (recorded dot / planned outline / today filled) on both; rollup chips ("1 run · 7.3km · load 61"), rest-day pill, titled day headers, hairline separators. |
| RunCards | **PASS** | Intensity edge (recorded = dominant-zone color, MISSED = ghosted gray, planned = outlined accent), status chips DONE ✓ / MISSED / PLANNED, **labeled metric grids (2×2 mobile, 4-across desktop)** with ≈ marks on estimates. **No dot-separated metric line anywhere on either side** (web body text grep: none). |
| 05 pill select | **PASS** | Tap scrolls the day card into view + selected ring (borderStrong outline verified by pixel check on emu; identical on web). |
| 06 sheet / panel opens | **PASS** (open) | Native + web-mobile: bottom sheet slides up on the ProposalModal chassis (grabber, title, Open full, X, DayDetails). Desktop: side panel animates in to the right (d-02-panel-anim catches it mid-slide), list column narrows (measured 860 → 828px), reopens in place (d-03 re-target Thu→Mon without closing). Same DayDetails content in sheet, panel and route. |
| 06b Open full → /calendar/day | **PASS** | Works from sheet (mobile, both sides) and panel (desktop, URL asserted). |
| 07 grabber drag-to-close | **DIFF (major) — BUG-1** | Dead on **both** sides. Native: scripted 521px drag from the grabber leaves the sheet fully open (07-sheet-drag-result); mid-drag frame shows the sheet does not follow the finger. Web: mouse-drag also fails (script fell back to X). |
| 07b X close | **PASS** | X closes the sheet on both sides; desktop panel X closes and the list returns to full width (860px, measured). |
| Body swipe on open sheet | **DIFF (minor) — BUG-2** | Native: an upward swipe on the sheet body (natural scroll attempt) dismisses the sheet. Web: same gesture does nothing. Reproduced twice (interactive + scripted run). |
| 08–08c month view + selection panel | **PASS** | Grid, selection ring, legend identical; the panel below the grid now renders full RunCards on both sides. |
| 09 coach empty | **PASS** | Round-1 BUG-1 (header under status bar) **fixed** — header row starts below the clock on emu (09 + light-09). Same header content, empty state, chips row (2nd chip clipped at the edge identically on both = horizontally scrollable row). |
| 10/11 coach streaming + done | **PASS** | Round-1 BUG-2 (auto-scroll stops short) **fixed** — after the stream, the reply tail is fully visible without manual scroll on emu (11) and web (11). Reply wording differs = LLM output, PLATFORM-OK. |
| 12 settings + sign-out | **PASS** | Account/Sign out, connection fields (masked, write-only hints, Test connection, sync status), model radios with DEFAULT badge, Appearance/Units, Save buttons — all match. Sign-out returns a clean sign-in form on both. |
| Light theme (all of the above) | **PASS** | System-level switch on both sides; light palette, hairlines, chips, zone colors match. Light sheet (white card on dimmed light page) verified on both. |

## Bugs, ordered by severity

### BUG-1 · MAJOR (native + web) — DetailSheet grabber drag-to-close does not work at all
- Spec §3 and the component's own docstring require "close-by-drag/X"; the PanResponder (`CLOSE_DRAG = 110`) is built for it.
- Evidence (native): `qa-screenshots/parity/emu/07-sheet-drag-result.png` — sheet fully open after a 521px drag starting on the grabber; scripted run prints `NOTE: grabber drag did NOT close the sheet`; interactive mid-drag screencap shows the sheet never translates (grabber stays at rest y).
- Evidence (web): `qa-screenshots/parity/web/07-sheet-drag-result.png` + run log `(drag did not close the sheet — falling back to X)` — the mouse drag from the sheet title straight down 560px also never closes it.
- Expected: dragging the handle/head down ≥110px (or a fast fling) closes the sheet; the sheet should track the finger while dragging.
- Root-cause hypothesis: `apps/expo/app/(app)/calendar/DetailSheet.tsx` (~lines 88–91) — the panResponder-bearing `<View style={s.handleRow} {...panResponder.panHandlers}>` is **wrapped in `<Pressable onPress={(e) => e.stopPropagation()}>`**. Pressability claims the touch at gesture start and never releases it mid-gesture, so the handleRow's `onMoveShouldSetPanResponder` is never consulted and the drag value never moves. Fixer pointer: put `{...panResponder.panHandlers}` on the wrapping Pressable itself (and give the PanResponder an `onStartShouldSetPanResponderCapture: () => true`), or drop the wrapper and carry `stopPropagation` on the handleRow — the wrapper must not sit between the touch and the pan handlers.

### BUG-2 · MINOR (native) — vertical swipe on the sheet body dismisses the sheet (web: no-op)
- A scroll attempt on the open sheet's body (content that fits does not scroll) closes the sheet on Android: `input swipe 540 1600 540 800` reproduced the dismissal twice (scripted run 2 + interactive). On web the same drag leaves the sheet open (RN-web pressability cancels on move) — a behavioral divergence and an accidental-data-loss risk on native.
- Root-cause hypothesis: the full-screen scrim `<Pressable style={s.overlay} onPress={onClose}>` (DetailSheet.tsx ~line 83) — on Android a press released within the same view fires `onPress` regardless of movement, and the `stopPropagation` Pressable only guards the head row, not the ScrollView body. Fixer pointer: wrap the whole sheet `Animated.View` (not just the head) in the stopPropagation Pressable, or only close when the press released within a small move-slop of where it started.

## Round-1 follow-ups (verified fixed this round)
- **Round-1 BUG-1 (coach header under status bar): FIXED** — `qa-screenshots/parity/emu/09-coach-empty.png` + `light-09-coach.png`: header content (avatar, Coach, model chip, history + New chat) starts below the status bar, matching web.
- **Round-1 BUG-2 (chat auto-scroll stops short): FIXED** — `qa-screenshots/parity/emu/11-coach-reply-done.png`: the reply tail is fully visible above the chips row with no manual scroll (matches web; `onContentSizeChange` follow-tail in coach/index.tsx).

## Explicitly checked and NOT bugs (do not "fix")
- Desktop side panel vs mobile sheet — the spec's intended divergence; each side matches its pattern.
- Native skips the marketing page; web-only "← Back" on sign-in; Roboto vs web system-ui; status bar/gesture bar chrome — platform defaults.
- Suggestion chips row clips its second chip at the right edge **identically on both sides** (horizontally scrollable row).
- Race pill/cell markers are **not exercisable** in the current data window (no race events in the visible week/month) — the race legend dot renders on both month views and the status logic is unit-tested (`apps/expo/src/lib/__tests__/week-view.test.ts`); re-check on a week containing a race.
- One-off flake in an intermediate run (sheet not yet visible in a light shot at 17:15) did not reproduce across two full reruns; not filed.
- Environment note: between runs, an in-app **Appearance=Dark** preference got persisted on the emulator (dark launches even with system light; the segmented control showed "Dark" selected). This is by-design override behavior (theme-context persists the preference), not a bug; `pm clear` in the flow resets it. Capture runs must not hand-toggle theme rows.

## Script repeatability
- `tools/parity_shots.sh` emu_flow rewritten for round 2: week-v2 steps (pill select → sheet → Open full → drag/X close → month panel) + coach/settings/sign-out + a light week-view pass. Sheet internals use calibrated coordinate taps with screencap pixel verification because uiautomator cannot see RN Modal windows; `emu_open_day_sheet` retries with scroll. Validated end-to-end (exit 0, dark + light).
- `tools/parity_web.cjs` rewritten: mobile dark/light + new desktop 1280px passes (panel open/anim/retarget/route/close + width measurements) and light desktop shots. Selector notes: labels use **short** weekdays (`Open full day detail for Thu 22`, sheet title `Thu 22 Oct`) — long-form selectors time out.
- `tools/parity_shots.sh all` ≈ 18 min for both sides.

PARITY: NOT SIGNED OFF (round 2) — week view v2 itself is at parity (pills, day/run cards, month panel, sheet/panel flows, both themes), and both round-1 bugs are fixed, but sign-off is blocked by BUG-1 (major: sheet drag-to-close dead on both sides). BUG-2 (minor, native-only swipe-to-dismiss) should ride along in the same fix. Re-run `tools/parity_shots.sh all` and re-check the 07 pairs (and ideally a week containing a race for the race markers) for sign-off.
