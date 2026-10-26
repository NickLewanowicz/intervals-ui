# Calendar Hero v4 + drill-down sheet spec (mobile + desktop)

Author: orchestrator (vision session), 2026-10-26. From the owner's review:
the four tiles have inconsistent separator lines ("distance and time don't
have a line above them; the side line isn't between time and load" — caused
by the verdict sentence wrapping and pushing the hairline grid), the verdict
sentence should leave the card, and tile taps should open a drill-down.

## Hero card v4 (both breakpoints, both scopes)

1. **Rows**: controls (range nav · Today · sync) → segmented + scope label →
   **tile row only**. The verdict sentence is REMOVED from the card. The
   Details drawer is REMOVED from the card.
2. **No hairlines between tiles.** The inconsistent separators die — tiles
   are plain columns on the card surface (the 4-across rhythm reads fine
   without lines; spacing does the grouping).
3. **Every tile is tappable** (whole tile ≥44px, pressed state): tapping ANY
   of the four tiles opens the **Coach drill-down sheet** (the mobile
   DetailSheet chassis — slide-up, grabber, scrim, drag-close; on desktop it
   may stay the same bottom sheet — a sheet is fine at both widths for v1).

### Drill-down sheet content (order top → bottom)
1. **Coach bubble**: coach avatar + a natural-language status paragraph —
   deterministic template built from the same stats (more conversational than
   the old verdict, e.g. "You're at 297 weekly load against a hold-flat of
   ≈232 — that's 297 vs 232, so you're loading more than you're shedding.
   Form sits at +5 (fresh) but it's trending down about 7/week."). Keep it
   2-3 sentences, numbers-first, no platitudes. This replaces the old
   headline verdict (the data behind it is identical — same pure inputs).
2. **The Gap** row (hold-flat / you / gap chips + InfoHint).
3. **Zone balance** (bar + flagged chips w/ tooltips).
4. **Fitness trend** (CTL/ATL mini-tiles w/ deltas).
5. **Recovery 7-day** (HRV/RHR/Sleep tiles).
(= everything the Details drawer had, minus the duplication, plus the coach
bubble lead.)

### Month scope parity
The hero is the SAME component for week and month scope (it already is) —
verify identical behavior in month mode: tiles tappable → same sheet, month
numbers, calendar grid below with the selected-day panel unchanged. The two
scopes must be indistinguishable in design language.

## Rules
- Tiles keep: label, value, flag-planned sub, InfoHint, compact size on mobile.
- No new deps. Tokens only. Tests: sheet-content pure model (coach paragraph
  template) + tile press wiring smoke.
- The buildVerdict inputs stay; only presentation moves.
