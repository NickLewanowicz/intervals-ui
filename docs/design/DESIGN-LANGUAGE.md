# intervals — Design Language

Owner: the vision/design session. This is the real system (V-06), rewritten
with eyes on the rendered app at 375px and 1280px. Code: `apps/expo/src/theme.ts`
(tokens) + `apps/expo/src/theme-context.tsx` (provider) + `src/components/glass.tsx`
and `src/components/motion.tsx` (primitives). Every screen consumes tokens —
zero hex literals outside `theme.ts`.

## North star

The app should feel like **viet-study** (https://viet.imnick.dev) translated
into **iOS-26 "liquid glass"** native patterns. Measured from viet in the
browser (round 2):

| viet-study value | what we took |
|---|---|
| nav `rgba(242,246,254,0.82)` + `blur(10px)` | glass chrome recipe (translucent surface + backdrop blur) |
| bottom nav: fixed, bottom 10, inset 12, radius 26, padding 6, border `#e4eaf6`, shadow `0 16px 40px rgba(63,89,180,0.16)`, filled active pill (radius 20) | our floating GlassBar tab bar verbatim |
| body `#f2f6fe`, ink `#10193b`, accent `#4f6af5` | our LIGHT palette + the accent hue family |
| soft diffuse shadows, generous radius, calm spacing rhythm | card/bar shadow tokens, radius scale |

Native translation: bottom **tab bar** (not a web navbar) with BlurView on
iOS/Android; headers and the chat input dock are GlassBars; the proposal
modal is a real bottom sheet on phone widths and a centered card on desktop.

## Principles (unchanged from SPEC)

1. **Calendar-first** — the week view is the home screen; density over decoration.
2. **Planned vs actual is the visual core** — muted planned → `text`-weight
   actual, separated by `→`; never confused.
3. **Races shout** — `race` tint is reserved (badge + month dot + left border).
4. **Calm data, confident chrome** — grayscale surfaces, one indigo accent for
   actions/selection, semantic color only for race/intensity/success/danger.
5. **Trust through explicitness** — proposals show exactly what will be
   written; chat carries the "Educational — not medical advice" footer.

## Theme system (V-06)

- `ThemeProvider` resolves `preference ('system'|'light'|'dark')` over the OS
  scheme (`useColorScheme`). Status bar follows.
- Persistence: PATCH `users.theme` when the field exists; PocketBase rejects
  unknown fields with 400, so the override also always lives in
  AsyncStorage (`intervals.theme`). **NOTE: the `theme` select field is not
  yet in the PB schema — AsyncStorage is the active store. Add a `theme`
  select (system/light/dark) to `users` to sync the preference across
  devices** (no migration was allowed this round).
- Dark is the default everywhere (SPEC: dark-first); light is a full first-class
  palette, not an inversion.

### Color tokens (see `theme.ts` for values)

- Surfaces: `bg`, `card`, `glass`, `glassStrong` (dark navy-black family; light
  = viet's `#f2f6fe` + white).
- Lines: `border` (solid surfaces), `borderGlass` (1px white@10% dark /
  `#e4eaf6`-ish light), `borderStrong` (focus/today outline).
- Text: `text`, `muted`, `onAccent`.
- Accent (ONE): `accent` (fills: buttons, active tab pill, user bubbles,
  selected rows), `accentText` (accent-as-text, brightened in dark for
  contrast), `accentSoft` (tinted washes).
- Semantic: `success` (recorded checkmarks), `danger` (errors, delete).
- **Reserved:** `race` (RACE events only — never decoration), `zones[0..6]`
  (Z1 cool blue → Z7 hot rose; intensity data only: zone bars, 80/20 split).

### Scales

- Spacing 4pt grid: 4/8/12/16/24/32/48.
- Type: 11/13/15/20/26/36 (+ lineHeight pair), tabular numerals for all stats
  (`fontVariant: ['tabular-nums']`).
- Radius: 8/12/16/24/pill.
- Touch targets ≥ 44pt (`layout.minTouch`).
- Motion (`motion`): press scale 0.97 with tension/friction springs; page
  slide+fade 180ms (week/month switches); sheet slide-up (native Modal slide).
  Respect for reduced-motion via `useReducedMotion` helper.

## Glass recipe

- **Native:** expo-blur `BlurView` (intensity 45 dark / 65 light, matching
  tint) + translucent palette wash for legibility.
- **Web:** BlurView's web tints are neutral grays (off-palette), so
  `GlassSurface` renders `backgroundColor: palette.glass` + inline
  `backdrop-filter: blur(20px) saturate(150%)` — the same recipe as viet's
  nav. Verified on the static web export.
- **GlassCard** = solid `card` surface + hairline + soft diffuse shadow
  (content reads best on solid; glass is for chrome).
- **GlassBar** = chrome (tab bar, headers, chat dock). `floating` variant =
  viet's pill: inset, radius 24, `glassStrong`, big diffuse shadow. The tab
  bar constrains to 480px centered on desktop.
- Shadows: `shadows(p).card` (soft lift) / `.bar` (chrome float) — diffuse,
  never heavy.

## Icon set

**Ionicons** (`@expo/vector-icons`) — chosen over Feather because we need
filled/outline pairs for tab selected states (Feather has none) and full
coverage of every glyph we use (calendar, chatbubbles, settings, flag, eye,
sync, tray, book, checkmark, arrows, logo-google). Tabs: `calendar`,
`chatbubbles`, `settings` (outline off / filled on). Proposal verbs:
`add-circle-outline` / `create-outline` / `trash-outline` in a filled badge.
Sync `sync`, reveal `eye-outline`/`eye-off-outline` (hold to reveal), send
`arrow-up`, retries `refresh`, empty states `calendar-clear-outline`,
`moon-outline`, book `book-outline`, steps `link/chatbubbles/checkmark-circle`.

## Motion specs

| Interaction | Spec |
|---|---|
| Press (cards/buttons/tabs) | scale → 0.97 spring (tension 400), release spring (tension 300) |
| Coach thinking | `TypingDots`: 3 dots, opacity 0.35→1, 260ms, 160ms stagger, loop |
| Week/month switch | `SlideFadeIn`: opacity 0→1 + translateX ±14→0, 180ms cubic-out, direction-aware |
| Proposal modal | native `animationType`: slide (bottom sheet, <720px) / fade (centered, ≥720px) |
| Streaming text | content + `▌` caret; typing dots only until first token |

## Screen patterns (round-2 state)

- **Headers** are fixed GlassBars (safe-area padded); the body scrolls under
  them in its own ScrollView (FIX-2: tab scenes clip — plain Views never
  scroll). Calendar header row 2 = Week/Month segmented control + "synced Nm
  ago" chip (taps → Settings) + sync IconButton.
- **Stats strip**: planned → actual pairs, caption states its scope honestly
  ("week of Oct 19" / "October 2026" — FIX-3).
- **Day detail**: monospace description block, RECORDED block with the
  proportional stacked zone bar + per-zone legend (FIX-4).
- **Month grid**: constrained 560px; planned = hollow muted dot, recorded =
  filled text dot, race = filled race dot + legend (FIX-12).
- **Coach**: avatar (generated asset) + short model name in the glass header
  (no 375px truncation), retryable error row (never "(no reply)" — FIX-9),
  disclaimer footer (FIX-10), floating glass input dock with accent send.
- **Splash** (web-only route; native redirects to /sign-in): Hero (generated
  mesh bg + gradient fade to bg) → 80/20 anchor (display headline + intensity
  split bar) → books (*80/20 Running*, Fitzgerald & Johnson; *Run Like a Pro*,
  Fitzgerald & Rosario) → how-it-works → disclaimer with the due-diligence
  clause (FIX-5).

## Asset provenance

All generated 2026-10-24 with **black-forest-labs/flux-1.1-pro** on Replicate
(~$0.04/image, total ≈ $0.12; total size ≈ 248KB):

| Asset | Prompt (abridged) | Post-process |
|---|---|---|
| `src/assets/coach-avatar.png` | "Minimal geometric logo mark of a friendly running coach: simple circular badge, abstract runner figure, bold rounded geometric shapes, indigo blue and warm amber on deep navy, flat vector style, readable at 40px, no text" | 256px PNG (sips) |
| `src/assets/bg-dark.jpg` | "Abstract soft gradient mesh, deep navy-black with subtle indigo and warm amber glows, glassy blurred blobs, premium app hero background, soft focus, no text" | 1200px JPEG q72 |
| `src/assets/bg-light.jpg` | same brief, "very light airy blue-white with faint indigo glows" | 1200px JPEG q72 |

Wired in: splash hero (theme-matched) + chat empty state + coach header avatar.

## Reference notes (why not the others)

- intervals.icu: dense and expert — we borrow its honest data density
  (load numbers, zone bars) but not its chrome.
- Strava: consumer-clean cards — our day cards keep the friendly shape.
- TrainingPeaks: coach-grade charts — deferred (sparkline trend is V-07 later).
