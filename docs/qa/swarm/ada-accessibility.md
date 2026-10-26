# Ada — Accessibility & Keyboard-Only Round (QA stack, web)

- **Persona:** Ada — keyboard-first (RSI), occasional screen reader via a11y-tree.
  Tab / Shift+Tab / Enter / Escape / Space / arrows; mouse only where a keyboard
  path was proven absent (that absence is the finding).
- **Date:** 2026-10-26 · **Platform:** web (headless Chromium, 1280×800 + 880×800
  for the <900px sheet) · **Theme:** dark (system scheme) · **Account:**
  qa-marathon persona (marathon build data).
- **Stack under test:** `http://127.0.0.1:8788` (static web export) → QA
  PocketBase `127.0.0.1:8090` + QA mock coach API `127.0.0.1:8099`. Production
  was never touched (zero requests to intervals.icu / pockethost — verified via
  request logging during sign-in).
- **Tooling:** `.scratch/swarm/ada/driver.mjs` (stages: `signin`, `calendar`,
  `sheet`, `coach`, `settings`; JSON results in `.scratch/swarm/ada/out/*.json`)
  plus focused probes in `.scratch/swarm/ada/probe/` (trap mechanics, radio
  operability, stop-button, proposal card). All screenshots registered:
  `node tools/shot_registry.mjs index --agent ada` → 39 captures, commit
  `92c936f` (qa-screenshots/registry/2026-10-26/92c936f/ada/, `latest/ada/`).

---

## Core question: could a keyboard-only runner actually use this app?

**Coach and Settings: yes, end to end. Sign-in: yes (minor papercuts). Calendar: no — not safely.**

The calendar is where a keyboard user gets hurt. 34 Tab stops from page top to
the tab bar (no skip navigation), and **two info-i tooltips sit directly on
that path** (stops 11 and 13). Focusing either pops a full-screen modal bubble
that (a) disrupts the Tab order while open — focus bounces back to the trigger
or into the bubble — and (b) has a reachable state where **Escape is dead** and
Tab/Shift+Tab are contained inside the bubble's two nodes: only a mouse click
escapes. Everything below the hero card — the day strip, run cards, side
panel, and the Calendar/Coach/Settings tab bar — is unreachable whenever that
state hits. A keyboard-only runner can sign in, chat with the coach, review
proposals and change settings, but cannot reliably get around the calendar.

---

## Keyboard path map

### 1. Marketing splash → Sign-in — WORKS

| Step | Key path | Result |
|---|---|---|
| Splash | Tab ×2 → `Get started`, `Sign in` (native buttons) → Enter | Navigates to `/sign-in` |
| Credentials | Tab 1 = email, Tab 2 = password, Tab 3 = eye, Tab 4 = `Sign in` → Enter | Signs in, lands on `/calendar` |
| Focus visibility | UA outline (`auto 1px`) on every stop | Visible on dark |

- Papercut (Low): **Enter in the password field does not submit** — no `<form>`
  (`apps/expo/app/(auth)/sign-in.tsx`); keyboard users must Tab one more stop.
- Papercut (Low): **field labels are decorative** — the visible "Email" /
  "Password" texts are `<Text>` siblings, not associated with the inputs.
  Accessible name = placeholder only ("you@example.com", "••••••••").
  (`Field` in `apps/expo/src/components/ui.tsx`).
- Papercut (Low): "Show key while pressed" is hold-to-reveal; keyboard Enter is
  a pressIn+pressOut flash — the value is effectively unreadable without a
  pointing device (acceptable for a secret, worth knowing).

Evidence: `signin-initial`, `signin-email-focus`, `signin-filled`,
`signin-button-focus`, `calendar-after-signin`.

### 2. Calendar (week view, 1280px) — BLOCKED BY TRAP

Full forward Tab map (auto-escaping bubbles): **34 stops**.

| Stops | Elements | Keyboard result |
|---|---|---|
| 1–5 | `Previous`, `Next`, `Go to today`, `Sync status`, `Sync now` | Reachable, Enter works |
| 6–7 | `Week view` / `Month view` segmented control | Enter switches views (verified: month grid renders, 35 cells) |
| 8–13 | 4 status tiles + 2 info-i hints (`About Load`, `About form`) | Enter opens coach drill-down; **hints pop a trapping bubble — see F1** |
| 14–20 | Day strip: `div[role=tab]` ×7 ("Select Monday 26, today"…) | Focusable, **Enter selects** (panel updates — verified "Thursday 29 · 1 run · 10.0km"); **arrows dead** (Left/Right do nothing) — tab pattern not implemented |
| 21–31 | Run cards, side panel ("Open Monday 26 details", "Open Run club — … details"…) | Focusable, Enter opens day detail (UI change verified) |
| 32–34 | Tab bar: `Calendar`, `Coach`, `Settings` | Reachable (last), Enter navigates (verified `/coach`) |

- **F1 trap (High):** at stops 11/13 every pass pops a bubble; recovery is
  Escape-at-the-right-moment, and one reachable state is a hard trap (below).
- **F5 (Moderate):** `role=tab` list without arrow-key roving — 7 Tab stops and
  a pattern screen readers announce but the keys don't honor
  (`apps/expo/app/(calendar)/WeekCards.tsx`).
- **F6 (Moderate):** no skip navigation; tab bar is last in DOM, so a round
  trip to Coach costs ~33 Tabs. Consider moving the bar earlier in DOM or
  adding a skip target.
- Month view: cells labeled `2026-10-27: 1 planned, 0 recorded` (ISO date +
  counts — machine-flavored for a screen reader), Enter selects (UI change
  verified). Hint text says "Long-press for full detail" — long-press has no
  keyboard equivalent; the keyboard path to full detail is the side-panel /
  sheet "Open full" link, which exists — acceptable, but the hint promises a
  pointer gesture.

Evidence: `calendar-week-view`, `calendar-month-view`,
`calendar-month-day-selected`, `calendar-daytab-focus`,
`calendar-daytab-after-enter`, `calendar-runcard-after-enter`.

### 3. DetailSheet (narrow 880px) — WORKS (model citizen)

- Week-view "Open Monday 26 details" reachable by Tab, Enter opens the sheet.
- **Focus is moved inside on open** (lands on `Close day detail` X), Tab stays
  contained (Open full → X), and **Escape closes** (RNW Modal `onRequestClose`
  path). Closed state verified.
- Evidence: `sheet-narrow-week`, `sheet-narrow-open`,
  `sheet-narrow-focus-inside`, `sheet-narrow-after-escape`.

### 4. Coach — WORKS, fully usable by keyboard

Tab order: `Chat transport` chip → `Chat history` → `New chat` →
[pending-proposal bar when present] → 3 suggested replies → chat input →
`Send message` / `Stop generating` → tab bar.

- Chat input reachable (Tab stop 7/11); typing enables Send (`disabled` →
  `tabIndex -1` when empty, so it doesn't take a dead stop); Enter sends.
- **Stop button is tabbable and enabled during streaming** (Tab from input
  lands on it; verified `tabIndex 0` mid-stream).
- Proposal review: the modal **auto-opens** when the coach proposes (by design,
  `coach/index.tsx` setModal after the turn). Focus lands inside the modal;
  `View workout text`, `Approve`, `Dismiss` are all Tab-reachable; **Escape
  closes**; the full loop send → review → keyboard Dismiss was executed.
- The transcript proposal card (`Proposal: Add Easy mock run — pending`) is a
  labeled, tabbable button once the modal is closed (tabIndex 0 verified; it is
  unreachable while the auto-opened modal holds focus, which is correct modal
  behavior).
- Findings: input has **no accessible name beyond placeholder**
  ("Message your coach…") (F3); when Send unmounts on send, focus drops to
  body (Low); pending bar's name is its full sentence (fine, but an explicit
  label would be cleaner); modal contains non-interactive Tab stops
  ("Proposal details" / rationale text divs) — noise between Approve/Dismiss
  (Low).

Evidence: `coach-empty`, `coach-input-focus`, `coach-typed`, `coach-send-focus`,
`coach-streaming`, `coach-reply`, `coach-proposal-card`, `coach-proposal-modal`,
`coach-proposal-dismiss-focus`, `coach-after-dismiss`.

### 5. Settings — WORKS (one state bug)

Tab order: `Sign out` → athlete id field → OpenRouter key + eye →
`Test connection` → model radios ×3 → `Athlete profile` textarea → theme
radios ×3 → units radios ×2 → `Save changes` → tab bar. All stops show the UA
focus outline.

- **Radios are keyboard-operable**: Enter on "Theme Light" flipped the live
  palette (screenshot proof, preference not saved — no persistent state
  touched). Same-value re-activation is a safe no-op.
- **F4 (Moderate): radios expose no state to assistive tech.** Code passes
  `accessibilityState={{ selected }}`, but react-native-web renders neither
  `aria-checked` nor `aria-selected` for these (verified empty on all 8). A
  screen reader announces every model/theme/unit as "not checked". One-word fix
  (below).
- Arrow keys don't move within a radio group (each radio is its own Tab stop) —
  operable but not the radio pattern.

Evidence: `settings-view`, `settings-radio-focus`,
`settings-light-activated`, `settings-light-radio-focus`.

---

## Findings, severity-ranked

**P1 — F1 · Hint bubble traps/disrupts keyboard navigation; Escape unreliable (WCAG 2.1.2)**
`apps/expo/src/components/Hint.tsx` (InfoHint used on calendar tiles, settings, stat tiles).

Repro: `/calendar` → Tab ×11 (focus hits `About Load`, bubble pops) → Tab ×2.
Observed across runs: (a) focus bounces back to the trigger or into the
bubble's modal while it is open (20+ consecutive Tabs ping-ponging between
`Dismiss explanation` overlay and the bubble-text div — instrumented walk);
(b) when focus lands inside that modal, **Escape does not close it** (pressed
twice, bubble remained; Shift+Tab also contained — 6 stops, no exit). The
bubble is a full-screen RNW `Modal` whose only exit in that state is a pointer
click. Since two hints sit on the main Tab path of the calendar, a keyboard
user hits this wall every single pass. Note the contrast: DetailSheet and
ProposalModal — plain RNW Modals relying on `onRequestClose` — close on Escape
reliably; the Hint adds its own `window` keydown handler, which is dead once
focus is inside the RNW modal.

Fix direction: drop the window-level keydown and the full-screen Modal for a
tooltip-sized popover (or keep the Modal but move focus into the bubble on
open, add a real close button, and rely on `onRequestClose` — the pattern the
DetailSheet already proves works). Also close on blur.

**P2 — F2 · No skip navigation; tab bar is last (34 stops deep)**
Calendar renders header → hero → tiles → day strip → 11 run cards → tab bar.
Switching surface from calendar = up to 33 Tabs. Fix: render the tab bar
earlier in DOM order or provide skip links / a roving-tabindex list for the
run cards.

**P3 — F3 · Text inputs have no programmatic labels**
`Field` (`apps/expo/src/components/ui.tsx`) renders the label as a sibling
`<Text>`; sign-in email/password, coach chat input, API-key fields all fall
back to placeholder as accessible name (placeholder disappears on input —
nameless fields for SR users mid-edit). Fix: `accessibilityLabel={label}` on
the TextInput (one line in `Field`), or associate via id/htmlFor.

**P4 — F4 · Radio groups announce no state**
`apps/expo/app/(app)/settings/index.tsx` (model/theme/unit radios) passes
`accessibilityState={{ selected }}`; RNW does not map `selected` for
`role=radio` — DOM shows no `aria-checked`/`aria-selected`. Fix:
`accessibilityState={{ checked: selected }}`.

**P5 — F5 · Day strip declares `role=tablist/tab` without tab keyboard semantics**
`apps/expo/app/(app)/calendar/WeekCards.tsx`. Left/Right arrows do nothing, no
roving tabindex (7 Tab stops). Either implement arrows + `tabIndex` roving and
Enter/Space activation (already works), or downgrade to plain buttons.

**P6 — F6 · Non-interactive Tab stops inside modals**
"Proposal details" and the rationale text render as tabIndex-0 divs inside the
proposal modal's focus trap — keyboard users Tab through inert text between
controls. Audit RNW View tabIndex defaults on those nodes.

**P7 — Low**
- Enter doesn't submit sign-in (no `<form>`/`onSubmitEditing`).
- "Long-press for full detail" hint text promises a pointer-only gesture.
- Send button unmount on send drops focus to body (focus loss).
- Hold-to-reveal eye is keyboard-hostile by design (pressIn/pressOut flash).
- Month-cell labels are ISO dates ("2026-10-27: 1 planned, 0 recorded").
- Pending-proposal bar lacks an explicit `accessibilityLabel` (name = full
  sentence).

**Passes worth keeping**
- Focus visibility: UA `:focus-visible` outline (`auto 1px`, adaptive color) on
  every focusable element on every surface — zero invisible-focus stops in all
  walks. (A branded ring would survive future `outline: none` resets; today it
  works.)
- DetailSheet + ProposalModal: focus moved inside on open, contained, Escape
  closes, controls labeled — the app's own template for doing modals right.
- Every interactive control encountered had an accessible name; no unlabeled
  buttons found in any walk (icon buttons all carry labels).
- Reduced motion is respected in `PressableScale`/`SlideFadeIn` (code review).

---

## A11y-tree audit notes

DOM audit + `page.accessibility.snapshot()` per surface. Nameless focusables:
none found. Roles were consistent (`button`/`tab`/`radio`/`link`/`textbox`).
The two structural issues are F4 (state) and F5 (tab semantics) above, plus
placeholder-only input names (F3). Images: the coach avatar is decorative
(`accessibilityIgnoresInvertColors`, no alt) — acceptable since adjacent text
carries meaning; Ionicons glyphs are decorative inside labeled buttons.

## Environment notes (QA stack, for the swarm)

- First sign-in attempt failed because the persona seed landed mid-round
  (user created 20:50:18Z, seconds after my attempt) — not an app bug.
- `tools/qa_mock_worker.mjs` crashed on any apply/dismiss-batch call:
  `let body = {}` accumulated chunks into `[object Object]{…}` →
  `JSON.parse` throw killed the process. Fixed locally to `let body = ''`
  (one line) and restarted on :8099; another swarm agent also restarted it —
  the running instance serves the fixed code (verified with a no-op batch).
- Left-behind state: none (test proposals dismissed via the keyboard flow;
  theme change was in-session only and never saved; 0 pending proposals at
  end).
