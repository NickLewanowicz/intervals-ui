# Parity Round 1 — web (https://intervals.imnick.dev) vs native APK (emulator-5554)

Reviewer: qa-parity · 2026-10-24 · first full web-vs-native round
Method: identical signed-in flow driven on both sides, same order, both themes.
- **Web**: Playwright Chromium, 393×851 CSS px, `colorScheme` emulated
  (`tools/parity_web.cjs` via `tools/parity_shots.sh web`).
- **Native**: release APK `com.anonymous.intervalscoach` on Pixel5 emulator
  (1080×2280 @2.75x → 393dp width), night mode YES, every element located via
  `uiautomator dump` + tapped by parsed center (`tools/uidump.py`); no blind
  coordinate taps. Light theme via `adb shell cmd uimode night no` (system
  level — nothing saved in-app on either side).
- Captures: `qa-screenshots/parity/{web,emu}/01–11 + 04b/06b/06c/09b/10b/10c + light-*`.
- No proposal approved, no settings saved, nothing purchased; the test coach
  message ("What does my week look like?") was sent once per side —
  **emulator first, so the web pass started its chat with "New chat"** to keep
  the empty-state comparable.

## Capture inventory

| Flow step | web | emu |
|---|---|---|
| 01 launch | ✅ (marketing `/`) | ✅ (lands on sign-in — native skips marketing) |
| 02 sign-in filled | ✅ | ✅ |
| 03 calendar week (post-login, synced) | ✅ | ✅ |
| 04 calendar week settled | ✅ | ✅ |
| 04b week scrolled to top (hero) | ✅ | ✅ |
| 05 calendar month | ✅ | ✅ |
| 06 month day selected (grid) | ✅ | ✅ |
| 06b day panel below grid | ✅ | ✅ |
| 06c day detail (zone bar) | ✅ | ✅ |
| 07 coach empty | ✅ (via New chat) | ✅ |
| 08 coach reply streaming | ✅ | ✅ |
| 09 coach reply done | ✅ | ✅ |
| 09b chat scrolled to bottom | ✅ | ✅ |
| 10 settings | ✅ | ✅ |
| 10b settings scrolled (model) | ✅ | ✅ |
| 10c settings preferences (theme/units) | ✅ | ✅ |
| 11 sign-out | ✅ | ✅ |
| light calendar / hero / coach / settings | ✅ | ✅ |
| proposal modal | **SKIPPED** — not trivially triggerable in one turn; the modal is already web-verified (round-1 V-04). Nothing dismissed. | SKIPPED |

All captures individually verified non-blank and content-correct.

## Verdict table

| Flow step | Verdict | Notes |
|---|---|---|
| 01 launch | **PLATFORM-OK** | Native routes straight to sign-in (no marketing) — by design. |
| 02 sign-in | **PASS** | Same card, fields, masked password + eye, focus ring, Google-disabled button. Web-only "← Back" link = entry-context, PLATFORM-OK. |
| 03/04 calendar week | **PASS** | Both auto-scroll to today on load; same day rows, ✓ done-badges, accent recorded lines, identical copy. |
| 04b hero at top | **PASS** | Scroll works on BOTH (round-1 FIX-2 web-scroll bug is fixed). Hero identical: nav `Oct 19–25`, Today, sync chip, Week/Month pill, 2×2 stats, form note, Details. |
| 05 calendar month | **PASS** | Measured: grid row spacing **53.1dp native vs 53px web**; stats identical (105.0km / 10h14m / 927 / +2); "THIS MONTH" aggregation + planned/recorded/race legend match (round-1 FIX-3 verified fixed). |
| 06 + 06b day select & panel | **PASS** | Selection ring moves 25→22 on both; panel renders below grid with same header + chevron + entries. |
| 06c day detail | **PASS** | Same title, BY TIME bar, WORKOUT, notes block, RECORDED + proportional zone bar with SS/Z1–Z5 legend (round-1 FIX-4 verified fixed on both). |
| 07 coach empty | **DIFF (major)** | **BUG-1** — native header renders under the status bar. Layout/content otherwise identical. |
| 08/09 coach conversation | **DIFF (minor)** | **BUG-2** — native post-stream auto-scroll stops ~2 lines short; the reply's last line is clipped at the list's bottom edge until a manual swipe (09b). Web lands fully scrolled. Reply *text* differs between sides = LLM output, PLATFORM-OK. |
| 09b chat bottom | **PASS** (after manual scroll) | Same bubbles, chips row, "Educational — not medical advice." footer, composer dock. |
| 10/10b/10c settings | **PASS** | Account card + Sign out, connection fields (masked, eye hold-to-show), sync status, model radios with **DEFAULT badge + selected ring** (round-1 V-05 verified fixed on both), athlete profile + char counter, Appearance/Units segmented rows, Save buttons. |
| 11 sign-out | **PASS** | Both return to a clean sign-in form. |
| Light theme (calendar/coach/settings) | **PASS** | Both sides switch correctly via system; light palette (bg/surface/hairlines/accent, dark status-bar icons) matches. |

## Bugs, ordered by severity

### BUG-1 · MAJOR (native) — Coach header ignores the safe-area top inset; avatar/title render under the status bar clock
- Evidence: `qa-screenshots/parity/emu/07-coach-empty.png` (and 08/09, light-07) vs `qa-screenshots/parity/web/07-coach-empty.png`.
- Measured on the emulator dump: the "Coach" title's center is at **y=56px device (20.4dp)** and the avatar's top at ≈55px, while the status-bar frame is 0–66px (24dp) and the clock glyphs occupy y≈22–50px — i.e. the whole header row sits *inside* the status bar band, with the clock overlapping the avatar's top edge. On web the header sits cleanly at the top.
- Expected state: header content starts below the status bar, like the calendar tab does.
- Root-cause hypothesis: `apps/expo/app/(app)/coach/index.tsx` — the `GlassBar` header (line ~574) uses `headerBar: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2 }` (line ~813) with **no `paddingTop: insets.top`**, even though `insets` is already in scope (line ~256). `apps/expo/app/(app)/calendar/index.tsx:230` shows the correct pattern (`paddingTop: insets.top + spacing.sm + …`).

### BUG-2 · MINOR (native) — Post-stream chat auto-scroll stops short; last reply lines stay clipped until manual scroll
- Evidence: `qa-screenshots/parity/emu/08-coach-reply-streamed.png` / `09-coach-reply-done.png` (final line half-clipped at the list's bottom edge behind the suggestion chips row) vs `09b` (fully visible after one swipe); web `08/09` always land fully scrolled.
- Expected state: when the stream finishes, the list is scrolled to the true bottom (like web).
- Root-cause hypothesis: `apps/expo/app/(app)/coach/index.tsx:309-311` — `useEffect(() => scrollToEnd({animated:false}), [messages])` only re-fires when the messages **array** changes; the assistant bubble then grows during streaming without another `scrollToEnd`. Fix: also trigger on streaming text changes / `onContentSizeChange`.

### Explicitly checked and NOT bugs (do not "fix")
- Native skips the marketing page (launch → sign-in) — intended.
- "← Back" link under the web sign-in card only — web navigation context.
- Reply wording/length differs between sides — LLM output, not UI.
- Font: Roboto (Android system) vs web system-ui stack — platform default.
- Status bar / gesture bar / keyboard presence — platform chrome.
- Settings title sits tight-but-clear of the status bar (no overlap) — OK.
- Native coach avatar ≈40dp vs web 32px — re-judge after BUG-1 (the missing inset currently distorts header metrics); not filed separately.

## Also verified while here (round-1 web-only report follow-ups)
- FIX-2 (no scroll on web): **fixed** — wheel scroll works on calendar/settings (04b/10b captures).
- FIX-3 (stale week stats in month view): **fixed** — "THIS MONTH" with month aggregates on both sides.
- FIX-4 (no zone-times bar in day detail): **fixed** — proportional stacked bar with legend on both sides.
- V-05 (model picker selected/default state): **fixed** — DEFAULT badge + selected ring on both sides.

## Script repeatability
- `tools/parity_shots.sh emu` — rewritten to the uiautomator method
  (`tools/uidump.py` locate-by-text/desc/edit-index → tap parsed center,
  verify typed text, keyboard dismissed before submits, scroll-until-visible
  retries, creds parsed from line 1 only). **Validated end-to-end on this
  round (exit 0, full dark flow + light pass)** — validation reproduced
  BUG-1 and BUG-2 independently of the interactive run.
- Validation surfaced and fixed two script bugs worth knowing about:
  `uidump.py tap-edit 1` originally passed the index as the wrong argparse
  positional (silently re-tapped field #0 — always verify typed text, it
  saved the run), and the cred parser had to be pinned to line 1 of
  `dev-user.txt` (later prose lines contain a literal `(`).
- `tools/parity_shots.sh web` — now `tools/parity_web.cjs`: robust selectors
  (input-index fill, aria-label day-detail chevron, "New chat" before 07 so the
  shared server-side chat history doesn't leak into the empty state), 02 shot
  restored, dark pass + light pass, streams polled to completion.
- `tools/parity_shots.sh all` = one command, both sides, ~10 min.
- Cred hygiene: no saved artifact contains the password — uiautomator dumps
  show masked field values only (•••), and screenshots show the masked dots.

PARITY: NOT SIGNED OFF (round 1) — 1 major (BUG-1 coach header safe-area) + 1 minor (BUG-2 chat auto-scroll); everything else PASS or PLATFORM-OK. Re-run `tools/parity_shots.sh all` after fixes and re-check 07/08/09 pairs for sign-off.
