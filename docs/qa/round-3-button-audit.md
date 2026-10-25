# Round 3 — Button / Layout Audit

**Date:** 2026-10-24 · **Target:** https://intervals.imnick.dev (production)
**Viewports:** 375x812 and 1280x800 · **Method:** live DOM measurement (`getBoundingClientRect` + computed styles on every `[role="button"]/[role="radio"]/a`, comparing child centers vs button-box centers) + visual pass at both widths.
**Companion artifacts:** 27 screenshots in `qa-screenshots/round-3-audit/`, raw measurement JSON in `.scratch/r3-measure-*.json`.

**Hard-rule compliance:** proposal modal triggered twice, screenshotted both form factors, **Dismissed both times — Approve never clicked**. No settings saved. Signed out at the end. No code modified.

---

## 1. Executive summary

The owner's report is confirmed and is **one systemic bug, not many**: every control built on `PressableScale` (that is: `Button`, `IconButton`, tab-bar items, day cards, month cells, pending-proposal bar, splash footer CTA) renders its content **top-aligned** inside the tap target, because all centering/layout styles are applied to a wrapper `Animated.View` while the actual `Pressable` hit-area gets none. The same architecture shrink-wraps the hit area horizontally, so icon buttons have a **20px-wide** pressable inside a 44px visual. Icon glyphs additionally draw ~2px high from Ionicons font metrics, which compounds the perceived misalignment on icon+label buttons.

Controls built on plain `Pressable` with styles on the Pressable itself (segmented Week/Month, eye toggles, model radio rows, theme/unit selectors) measure **pixel-perfect (child center-y offset = 0.0px)** — they are the proof of the root cause and should not be "fixed".

**Findings: 24 total** — 9 VERTICAL_MISALIGN · 8 TOUCH_TARGET (incl. 3 shrink-wrapped/dead-zone) · 4 INCONSISTENT_PADDING · 2 LAYOUT_BREAK (row direction lost) · 1 HIT_AREA_MISMATCH. Zero HORIZONTAL_MISALIGN, zero TEXT_OVERFLOW, zero WIDTH_CONSTRAINT at 375/1280. Console: **0 errors** (2 benign warning families).

---

## 2. Systemic root causes (pin-pointed to files)

### RC1 — `PressableScale` puts layout styles on the wrapper, not the Pressable *(primary — explains ~80% of findings)*
`apps/expo/src/components/motion.tsx:50-68`:

```tsx
<Animated.View style={[style, { transform: [{ scale }] }]}>   // ← s.button / s.iconButton / s.tab land HERE
  <Pressable ... style={styles.fill}>                          // ← only { flexGrow: 1, flexShrink: 1 }
    {children}
  </Pressable>
</Animated.View>
```

`styles.fill` (motion.tsx:163-167) has **no `alignItems`, no `justifyContent`, no `flexDirection`**. Measured computed styles on every affected control:

| element | visual box (Animated.View) | actual Pressable (role=button) |
|---|---|---|
| Button | `align-items:center; justify-content:center; min-height:44; padding: 0 16` | `flex-direction:column; align-items:stretch; justify-content:flex-start` |
| IconButton | `align-items:center; justify-content:center; 44x44` | same column/flex-start |
| Tab item | `flex-direction:row; align-items:center; gap:8` | same column/flex-start |

React Native styles do not inherit, so centering on the wrapper centers only the Pressable *inside* the box — the Pressable's own children then lay out at `flex-start` of a column. Consequences:

1. **Children pinned to the top** of the button box (measured offsets in §3).
2. **`flexDirection: 'row'` and `gap` never reach the children** wherever a row was declared (`s.tab`, `s.pendingBar`) → icon and label **stack vertically** (tab bar, pending-proposal bar).
3. **Wrapper `alignItems:'center'` shrink-wraps the Pressable horizontally** (flexGrow only fills the column = vertical), so the hit area is content-width: IconButton → **20px wide**, MonthCell → **16.2px wide**, `flex:1` modal buttons → 85px of 219px. Taps on the visual button's sides do nothing.

**Fix direction:** apply the box styles to the `Pressable` (or give `styles.fill` `{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }` and keep only paint styles — background/border/radius/padding — on the wrapper; padding must stay on the wrapper or be duplicated, since it insets the hit area correctly today). This one change fixes findings F1–F9, F12–F14, F18–F20 below.

### RC2 — Ionicons glyph ink sits high inside its own text box *(secondary, cosmetic)*
Every icon `<div>` is 1.12em tall (fs 17 → 19px box, fs 20 → 22.5px) with `line-height: normal`, and the Ionicons glyph draws toward the top of that em box. Visible even where the *box* is perfectly centered (Theme "Light"/"Dark"/"System" icons, eye toggle): ink reads ~2px high. Where RC1's −11.5px box offset compounds it ("Test connection", "Sign out", "Save changes", "New chat", "Approve", "Get started", "Sign in" arrow), icons read 4–6px high vs their label. Fix after RC1: nudge icon container (`lineHeight` equal to button text's, or `translateY` 1px), not the buttons.

### RC3 — Per-call-site size overrides on the shared Button *(INCONSISTENT_PADDING)*
`ui.tsx s.button` = `paddingHorizontal: 16, paddingVertical: 0 (minHeight 44 carries the height)`. Call sites then override ad hoc:
- `calendar/index.tsx:480` `todayBtn: { minHeight: 38, paddingHorizontal: 12 }`
- `coach/index.tsx:261` `newChat: { minHeight: 40, paddingHorizontal: 12 }`
- `coach/index.tsx:326` `retryBtn: { minHeight: 40, paddingHorizontal: 12 }`

Same-role buttons ship at three heights (38/40/44) and two paddings (12/16). Since `paddingVertical` is 0 everywhere and height relies on `minHeight` + centering, RC1's broken centering turns each override into visible top-pinned text (smaller minHeight ⇒ smaller offset but same bug).

### RC4 — Interactive text/links with no min target
Splash footer CTA (`marketing/index.tsx:171`, PressableScale around a bare `Text`) = **17.5px** tall hit area. Sign-in "← Back" (`sign-in.tsx:86-89`, `Link > Text` with `padding:8` on the Text): the anchor hit box measures **343x16.5** while the visible pill is 61x31 — padding lands on the inner text node, so the anchor underfills its own visual and both are under target. Calendar "synced Xm ago" chip = **13px** tall (`hitSlop 6` → ~25px effective).

---

## 3. Findings table

Offsets are `child bounding-box center − button visual-box center` in px (negative = above/left). "Hit" = actual `Pressable` box; "Visual" = styled wrapper. Identical at 375 and 1280 unless noted.

| # | Surface | Element | Severity | Measurement | Hypothesis (file/style) | Screenshot |
|---|---|---|---|---|---|---|
| F1 | Calendar header | Prev `‹` / Next `›` arrows | VERTICAL_MISALIGN + TOUCH_TARGET | Visual 44x44; icon box 20x22.5, **cy −9.8** (top gap ≈1px, bottom ≈21px). Hit area **20x42** = 45% of visual width | RC1 (IconButton → `iconButton` centers on wrapper only); RC1 shrink-wrap for hit width | calendar-week-current-375/1280.png |
| F2 | Calendar header | "Today" | VERTICAL_MISALIGN + INCONSISTENT_PADDING + TOUCH_TARGET | Visual 69x38; text cy **−9.3** (top gap ≈1px); minHeight 38 vs 44 base; padH 12 vs 16 base; hit 43x36 vs visual 69x38 | RC1 + RC3 (`s.todayBtn` calendar/index.tsx:480) | calendar-week-current-375.png |
| F3 | Calendar header | "Sync now" | VERTICAL_MISALIGN + TOUCH_TARGET | identical to F1 (20x42 hit, cy −9.8) | RC1 | calendar-week-current-375.png |
| F4 | Calendar header | Week/Month segmented control | TOUCH_TARGET (minor) | Text cy **0.0** (centered ✓); pressable 64x25 in 33px container | None — correct; only total height 33 < 44. Do NOT restyle while fixing RC1 | calendar-week-current-375.png |
| F5 | Calendar header | "synced Xm ago" chip | TOUCH_TARGET | Hit **94x13** (hitSlop 6 → ~25 effective) | RC4 (`syncFresh` Pressable, calendar/index.tsx:172-181) | calendar-week-current-375.png |
| F6 | Calendar week | Day cards (x7) | DEAD_ZONE (hit-area mismatch) | Hit 317 wide vs visual 343 (12px padding ring dead on all sides); content flows top-down as designed | RC1 (padding on wrapper insets hit area; card content top-alignment is acceptable visually) | calendar-week-current-375.png |
| F7 | Calendar month | Month cells (all 35) | VERTICAL_MISALIGN + TOUCH_TARGET | Visual 43.6x43.6; day-number cy **−13.3**, dots cy **−2.3** (centered would be ≈ −5.0/+7.5); hit **16.2x41.6** = 37% width | RC1 (`monthCell` centers on wrapper; Pressable shrink-wraps to number width) | calendar-month-1280.png (visible at large size), calendar-month-375.png |
| F8 | Day detail header | Back `‹` | VERTICAL_MISALIGN + TOUCH_TARGET | identical to F1 (44x44 visual, cy −9.8, hit 20x42) | RC1 | day-detail-2026-10-24-375/1280.png |
| F9 | Tab bar (all tabs) | Calendar / Coach / Settings items | LAYOUT_BREAK (row lost) + VERTICAL_MISALIGN | Pill 115x50 (150x50 @1280); Pressable is **column**: icon 21px cy **−7.5**, label 15px cy **+10.5** → icon stacked on label; declared `flexDirection:'row'`, `gap:8` (s.tab) never apply; badge (when pending>0) stacks under label at pill's bottom edge | RC1 (`s.tab` in app/(app)/_layout.tsx:131-140 on wrapper) | coach-empty-375.png (active pill), proposal-modal-1280.png (badge "1" clipped at pill bottom) |
| F10 | Coach header | "New chat" | VERTICAL_MISALIGN + INCONSISTENT_PADDING + TOUCH_TARGET | Visual 118x40; icon+text cy **−9.5**; minHeight 40 + padH 12 (vs 44/16 base); hit 92x38 | RC1 + RC3 (`s.newChat` coach/index.tsx:261) | coach-empty-375/1280.png |
| F11 | Coach input dock | "Send message" (accent) | VERTICAL_MISALIGN + TOUCH_TARGET | Visual 44x44; arrow cy **−9.8**; hit **20x42** | RC1 (IconButton) | coach-empty-375.png, coach-conversation-1280.png |
| F12 | Coach (when pending) | Pending-proposals bar | LAYOUT_BREAK (row lost) + TOUCH_TARGET | Pressable column → tray icon stacked above text (visible in shot); minHeight 40 | RC1 (`s.pendingBar` coach/index.tsx:271-286 declares row+center on wrapper) | proposal-modal-375.png (top of screen) |
| F13 | Proposal modal | "Approve" (primary) | VERTICAL_MISALIGN + DEAD_ZONE | Visual 219x44 (flex:1); icon+text cy **−11.5** (top gap ≈1.75px); hit **85x42** — 67px of each visual side is dead inside the modal | RC1 (`s.button` + `style={{flex:1}}` on wrapper, ProposalModal.tsx:125-132) | proposal-modal-1280.png, proposal-modal-375.png |
| F14 | Proposal modal | "Dismiss" (ghost) | VERTICAL_MISALIGN + DEAD_ZONE | identical to F13 (hit 81x42, cy −11.5) | RC1 | proposal-modal-1280.png, proposal-modal-375.png |
| F15 | Sign-in | "Sign in" (primary) | VERTICAL_MISALIGN | Visual 309x44; arrow+text cy **−11.5**; hit 73x42 | RC1 | sign-in-375/1280.png |
| F16 | Sign-in | "Google — coming soon" (disabled) | VERTICAL_MISALIGN | Visual 309x44; G+text cy **−11.5** — label visibly pinned to top (clearest visual proof) | RC1 | sign-in-375/1280.png |
| F17 | Sign-in | "← Back" link | HIT_AREA_MISMATCH + TOUCH_TARGET | Anchor 343x16.5 while visible text pill 61x31 (padding on inner Text, not link); both < 44 | RC4 (sign-in.tsx:86-89, `s.back` padding on Text under `Link asChild`) | sign-in-375.png |
| F18 | Splash | "Get started" / "Sign in" CTAs | VERTICAL_MISALIGN | Visual 148x44; icon+text cy **−11.5** / text cy **−12.3** | RC1 | splash-hero-375/1280.png |
| F19 | Splash footer | "Ready? Your training, coached →" | TOUCH_TARGET | Hit = **239.7x17.5** (no min height, no padding) | RC4 (marketing/index.tsx:171) | splash-scrolled-books-375.png, splash-footer-1280.png |
| F20 | Settings → Account | "Sign out" | VERTICAL_MISALIGN | Visual 118x44; icon+text cy **−11.5**; hit 84x42 | RC1 | settings-account-375/1280.png |
| F21 | Settings → Connection | "Test connection" | VERTICAL_MISALIGN + INCONSISTENT_PADDING (none) | cy **−11.5**; icon additionally reads high from RC2 — most visible icon/label skew in the app | RC1 + RC2 | settings-account-375.png, settings-ai-model-picker-375.png |
| F22 | Settings → AI | Model radio rows (x3) | TOUCH_TARGET (minor) | cy **0.0** ✓, padding 10 uniform; height 40 (< 44 by `minTouch-4` design) | Deliberate; acceptable, but consider 44 | settings-ai-model-picker-375.png, settings-preferences-theme-units-1280.png |
| F23 | Settings → Preferences | Theme System/Light/Dark, Units km/mi | TOUCH_TARGET (minor) + RC2 | cy **0.0** ✓ (padding 10, height 40); icon *ink* ~2px high inside centered box | Deliberate size + RC2 | settings-preferences-theme-units-375/1280.png |
| F24 | Settings footer | "Save changes" | VERTICAL_MISALIGN | Visual 343x44; icon+text cy **−11.5** | RC1 | settings-preferences-theme-units-375/1280.png |

**Explicitly clean (measured 0.0px offsets, do not churn):** segmented Week/Month text (F4), both hold-to-reveal eye buttons (44x44, cy 0.0 — `s.eyeBtn` styles the Pressable itself, ui.tsx:298), model radio rows (F22), theme/unit selectors (F23), chat input (44px, padding 11/11). No HORIZONTAL_MISALIGN anywhere; no TEXT_OVERFLOW (long titles ellipsize via `numberOfLines`; tab labels have `flexShrink:1`).

**WIDTH_CONSTRAINT:** none found. At 1280 the calendar header inner and scroll body both center at x=210 width 860; tab bar caps at 480; month grid at 560; coach bubbles cap 84%. At 375 everything fits without overflow or clipped children (`overflowsBox: false` for every measured child). The owner's reported horizontal-constraint issue did not reproduce at 375/1280 on this build — worth re-checking at ~740px (between 720 modal breakpoint and 860 maxW) in a follow-up.

---

## 4. Touch-target inventory (< 44px effective)

| Control | Effective hit | Visual | Note |
|---|---|---|---|
| Today | 43x36 | 69x38 | RC1 + override |
| New chat / Retry | 92x38 / ~minHeight 40 | 118x40 | RC1 + override |
| Icon buttons (prev/next/sync/back/send) | **20**x42 | 44x44 | RC1 shrink-wrap |
| Month cells | **16.2**x41.6 | 43.6x43.6 | RC1 shrink-wrap |
| Modal Approve/Dismiss | 85/81x42 | 219x44 | RC1 shrink-wrap |
| Segmented Week/Month | 64x25 (33 container) | — | conventional, minor |
| Theme/Units/Model rows | height 40 | — | deliberate `minTouch-4` |
| Sync freshness chip | 94x13 (+slop 6) | — | RC4 |
| Splash footer CTA | 239.7x17.5 | same | RC4 |
| Sign-in Back link | 343x16.5 anchor / 61x31 visual | — | RC4 |

---

## 5. Console

**0 errors** across the entire session (splash → auth → all tabs → chat streaming → modal → sign-out). Warnings only, both benign on web:
1. `Animated: useNativeDriver is not supported… falling back to JS-based animation` (repeats per spring — PressableScale/TypingDots/SlideFadeIn; web-only).
2. `scrollTo(y, x, animated) is deprecated` (RNW internal).

---

## 6. Screenshot index (`qa-screenshots/round-3-audit/`)

| File | Surface / state |
|---|---|
| splash-hero-375.png / splash-hero-1280.png | Splash hero, CTAs |
| splash-scrolled-books-375.png | Splash: books, how-it-works, footer CTA |
| splash-footer-1280.png | Splash footer + disclaimer @1280 |
| sign-in-375.png / sign-in-1280.png | Sign-in (Google disabled; eye toggle) |
| signed-out-back-to-sign-in-375.png | Post-sign-out state (no confirm dialog exists) |
| calendar-week-current-375.png / -1280.png | Week Oct 19–25: rest days, multi-session Tue, race Sat |
| calendar-week-current-scrolled-375.png | Same week scrolled (Sat/Sun) |
| calendar-week-next-375.png | Week Oct 26–Nov 1 (second week) |
| calendar-month-375.png / -1280.png | Month grid (1280 shows top-pinned cell content) |
| day-detail-2026-10-24-375.png / -1280.png | Day with recorded run + zone bar + legend |
| coach-empty-375.png / -1280.png | Coach empty state (tab stacking visible) |
| coach-streaming-reply-375.png | Send → streaming reply |
| coach-conversation-top-375.png / coach-conversation-1280.png | Full conversation ("What does my week look like?") |
| proposal-modal-1280.png | Proposal centered-card form + pending bar + tab badge |
| proposal-modal-375.png | Proposal bottom-sheet form (both **Dismissed** after) |
| settings-account-375.png / -1280.png | Account + intervals connection + AI top |
| settings-ai-model-picker-375.png | Model radio roster + athlete profile |
| settings-preferences-theme-units-375.png / -1280.png | Theme selector, units, Save changes |

## 7. Recommended fix order (for the downstream fixer)

1. **motion.tsx `PressableScale`**: move `flexDirection/alignItems/justifyContent` onto the inner `Pressable` (keep paint + padding on the wrapper, or move everything and re-add padding). Fixes F1–F3, F7–F14, F15–F16, F18, F20–F21, F24 in one edit.
2. **Delete per-site size overrides** (`todayBtn`, `newChat`, `retryBtn`) or normalize to one secondary size — RC3.
3. **RC4 min-targets**: footer CTA + Back link + sync chip get `minHeight 44`/padding on the interactive element.
4. **RC2 icon ink nudge** last, purely cosmetic.
5. Re-run this audit's measurement script (`.scratch/r3-measure-*.json` holds the baselines) — success criterion: every child `cyOff = 0.0 ± 1px` and hit-width = visual-width on all PressableScale controls.

---

## 8. What changed (fix round, 2026-10-24)

All 24 findings fixed in the shared primitives; deployed to production and
re-measured with this audit's method (`/opt/homebrew` playwright + Chrome,
bounding-box centers; raw JSON in `.scratch/r3fix-measure-{local,prod}.json`,
script `.scratch/r3fix-measure.mjs`, pass/fail table `.scratch/r3fix-summarize.mjs`).
After-shots: `qa-screenshots/round-3-fixes/` (same filenames as §6 for pairing).

- **RC1** — `PressableScale` flattened to a single `Animated.createAnimatedComponent(Pressable)`:
  the Pressable now carries the full call-site style (layout + paint + padding) and the
  transform is the only added style. Hit area = visual box by construction. Verified the
  JS-fallback spring still animates on web (`matrix(0.97…)` during press).
- **RC3** — canonical single Button size (minHeight 44, paddingHorizontal 16); deleted the
  `todayBtn` / `newChat` / `retryBtn` overrides. No `sm` variant added: the audit gate is
  ≥44 everywhere, so any smaller variant would reintroduce sub-44 targets.
- **RC4** — splash footer CTA and sync-freshness chip are real 44px Pressables; the
  sign-in "← Back" anchor now wraps a 44px padded hit box.
- **RC2** — new shared `Icon` in `ui.tsx` applies one measured optical nudge
  (`translateY: 0.06em`, calibrated by pixel-scanning glyph ink vs label ink on the
  sign-in page; icon ink now within ~0.3px of label ink). Used by Button, IconButton,
  Field eye, tab bar, pending bar, theme selector.
- **F4/F22/F23** — segmented control container now 44px total (`segBtn` minHeight 38);
  model radio rows and theme/unit choice buttons bumped 40 → 44.
- **F12** — pending bar `minHeight` 40 → 44 (row direction restored by RC1; no pending
  proposal existed at re-measure time, structure verified via the identical tab-row pattern).

Re-measure results: every previously-failing control ≥44px hit with child box centers
within ±2px (icons +1.0–1.2 = the deliberate ink nudge; text 0.0; month-cell number/dots
−5.0/+9.5 = designed group centering); tab items measure `row` again; modal buttons hit =
visual (142.5px @375 / 219px @1280); 0 console errors. Approve was never clicked — the
chat-created test proposal was Dismissed afterwards to restore state (same as this audit's
hard-rule compliance).
