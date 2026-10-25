# Calendar Home v2 — design spec (from owner's review + reference boards)

Author: orchestrator (vision session), 2026-10-25. Sources: owner's screenshot of
the current stats card ("messy, walls of text, ugly arrows") + 4 reference boards
the owner supplied (light readiness-ring app; analytics card-grid; pastel
charts-tooltips app; dark metric-tile app). Reference images were transient —
this spec is the canonical record of what to build.

## What the owner said (verbatim intent)

1. Data is good; presentation is messy. Use hidden tooltips / hover info /
   font styling instead of exposed walls of text. The arrows (→ ▼ ▲) are ugly.
2. Top nav: rounded-corner padding is cramped at the edges; the wasted
   white space in the middle was never solved. Opportunity: **merge the top
   nav and the stats card into one hero block** for better real estate.

## Reference patterns to adopt (from the boards)

- **Metric tiles** (dark board): icon + small label + BIG value + small delta
  sub-line ("↑ 2.1% vs last week" as colored text, no bare arrows floating).
  2-column tile grid on mobile, 4-across on desktop.
- **Ring gauge** (light board's readiness 85/100; dark board's goal 75%):
  candidate for FORM — a ring on the fresh↔fatigued scale with the band word
  under it; also for "week load vs hold-flat".
- **Charts with tooltip bubbles** (pastel board): zone/week charts get a
  press/hover tooltip bubble — apply to the zone bar.
- **Card grid with section headers** (analytics board): secondary stats as a
  tidy 2-col grid of small cards, not stacked prose.

## Component spec

### 1. Hero block = nav + week summary merged (kills the wasted middle)
One glass card at top:
- Row 1 (controls): ‹ week-range › | Today … right side: sync chip (moved
  from stats header) + sync button. Tightened: side padding 14 inside the
  pill so controls don't hug the rounded edge (fixes the cramped-corner bug).
- Row 2 (merged summary strip): 3-4 compact metric tiles inline — Distance
  (planned→actual), Time, Load, Form-ring (mini). Replaces the old
  "stats header + planned-vs-actual" duplication. Mobile: 2×2 tiles;
  desktop: 4-across.
- The hero is ONE surface (single glass card, internal hairlines between
  tiles) — no nested cards.

### 2. StatTile primitive (theme-driven)
`icon?, label (11px small-caps muted), value (22-24px bold, tabular),
sub? (12px delta/context chip)`. Sub-lines use colored text chips (green
better / red worse / muted neutral) with a small directional ICON — never a
bare "→/▼/▲" text arrow. Planned→actual renders as two stacked values in one
tile: label "DISTANCE", value = actual (big), sub = "planned ≈30.4km" (muted).

### 3. Verdict line — one sentence, no duplication
Keep the computed verdict ("Form +2, trending down · hold-flat ≈ 274/wk,
you're at 137") as the hero's single sentence — it already encodes what the
old FORM/CTL/DISTANCE rows repeated. Remove the then-redundant rows.

### 4. Details drawer — hierarchy + tooltips instead of prose
- Section headers small-caps; content in compact rows/tiles, NOT paragraphs.
- **Fitness row**: two mini-tiles (CTL, ATL) with delta chips; no arrows.
- **Zone balance**: keep the stacked bar; the three findings become compact
  flagged chips ("LOW 15% ⚠︎", "MOD 27% ⚠︎", "HIGH 59% ⚠︎") where
  press/hover opens a tooltip popover with the full sentence (moderate-trap
  explanation, fence-rider callouts move INTO the tooltip). One line, not five.
- **The Gap**: one row, three stat chips: Hold-flat 274/wk · You 137 ·
  Gap 137 (colored). The definition sentence ("Hold-flat = the weekly load…")
  moves into an info-i tooltip.
- **Recovery**: three mini-tiles (HRV, RHR, Sleep) with delta chips.
- Implement ONE `Tooltip`/`LongPressHint` primitive: web = hover/focus
  popover; native = long-press popover. Used by info-i icons and flagged chips.

### 5. Rules
- No bare text arrows anywhere (→ ▼ ▲) — icons or colored chips only.
- Any sentence longer than ~12 words in the card must become a tooltip.
- Tokens only; AA contrast; measurements reported for the nav-padding fix
  (controls ≥12px clear of the pill's rounded edge).

## Acceptance
- Hero: one glass card, controls row + tile strip; measured: no cramped
  corners (≥12px clearance), middle space used by tiles.
- Card content: verdict + tiles + drawer; zero exposed prose paragraphs;
  every definition reachable via tooltip; no bare text arrows (grep for
  → ▼ ▲ in the calendar components returns nothing outside tests).
- Both themes, 375 + 1280; tests for new pure bits (tile model, tooltip copy
  mapping); all existing tests stay green.

---

## Build note (round 11, ui-builder, 2026-10-25)

Shipped as specified, with two measured deviations from the §1 sketch:

- **Controls row**: the sketch put the sync chip in row 1; at 375px the row
  is over-packed once the Week/Month segmented also lives there (the range
  title truncated to "O."). Final layout: row 1 = ‹ range › · Today ·
  (spring) · synced chip + sync button (chip kept in row 1 per spec);
  row 2 = Week/Month segmented + small-caps scope label ("THIS WEEK" /
  "THIS MONTH" / "WEEK OF …" when navigated away), then the tile strip.
- **Verdict** now signs form ("Form +2") to match this spec's example;
  `buildVerdict`/tests updated. Longest run + estimation notes moved into
  the Distance/Time tile tooltips (`tileHints`); honesty split moved into
  the gap tooltip (`gapCopy`); gapLine/trendArrow (arrow-based) removed.

Measured (local + production, 375 and 1280, both themes): first control sits
**15px** clear of the 24px-radius pill edge (spec minimum 12); hero is ONE
glass surface (internal hairlines only); form ring = SVG circle
(react-native-svg 15.15.4, expo-recommended); `grep →|▼|▲` over the calendar
dir returns 0 hits; production shows zero console errors; verdict matches the
mirror (Form +2 · hold-flat ≈ 274/wk · at 137). Tooltips: web = hover/focus +
press, dismiss on out-press / Escape / scroll intent / pointer leaving both
anchor and bubble; native = long-press. Screenshots:
`qa-screenshots/round-11-home-v2/` (+ `production/`). Files:
`apps/expo/app/(app)/calendar/HeroCard.tsx` (replaces StatsCard.tsx),
`FormRing.tsx`, `src/components/Hint.tsx`, `StatTile` in
`src/components/ui.tsx`, pure builders in `src/lib/stats-view.ts`.
