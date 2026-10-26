# Week view — mobile compact spec (v2.1)

Author: orchestrator (vision session), 2026-10-26. From the owner's review of
production mobile: "a lot of containers wrapping each other, margin/padding
quite a lot… floating text in a card became nested boxes." Desktop (≥900px)
keeps the round-13 layout — THIS SPEC IS MOBILE (<900px) ONLY. Reference
boards (style/theme only): dark fitness app with compact activity rows
(icon-stats inline, 2-line rows, colored left edges) and the neon-green
schedule app (day pills + one-line schedule rows with colored edges).

## Diagnosis of current mobile week view

1. **Three-level nesting**: page margin → outer week card → day card → run
   card. Each level adds its own padding + rounding, so a 375px screen shows
   ~24px total inset and run content squeezed into ~280px.
2. **Vertical bloat**: day section ≈ 260px for ONE run — header row (day +
   3 chips), then a nested run card whose metrics stack in a 2-col grid over
   3 lines (DISTANCE/TIME then LOAD), plus hairline + ~40px section gaps.
   A 7-day week needs ~1800px of scroll.
3. **Rest days render twice**: header "Wednesday 28 · Rest day" AND a
   separate moon-icon row below.
4. **Redundant hierarchy**: rollup chips duplicate what the run rows show.

## Mobile spec (<900px)

Flat rhythm — NO nested cards. The week container keeps ONE hairline-bordered
card surface (matches the hero), but inside it content sits directly on the
surface:

1. **Day header row** (slim): colored date badge (like ref: red/accent block
   "TUE 27", 32×32, today = accent fill) + day name semibold + rollup chips
   inline right (chips shrink to text-only, muted, e.g. "10.5km · 108").
   Height ≤ 36px. Load chip only when > 0.
2. **Run rows** (the core change): each run = ONE row, ≤ 64px tall:
   - 3px colored left edge (status/zone as today — keep).
   - Line 1: time "06:00" (muted mono) + name (semibold, 1-line ellipsis) +
     status chip right-aligned (PLANNED outlined / DONE ✓ green / MISSED red
     / RACE amber).
   - Line 2: inline icon-stats with 10px muted labels-over-nothing —
     `8.5km · 47m · load 52` as three compact icon-stat pairs
     (distance-icon 8.5km, timer-icon 47m, bolt-icon 52) using Ionicons
     12px + value; gap 12px. Estimated values keep ≈.
   - Optional type tag (Intervals/Tempo) folds INTO line 1 after the name as
     a tiny muted tag — only when it fits.
   - Padding: 10px vertical, 12px horizontal. NO inner card rounding — rows
     sit on the week surface with 8px gaps and (only for multi-run days)
     hairline separators between runs.
3. **Rest day**: ONE line — moon icon + "Rest day" muted, height 32px. Kill
   the duplicate row.
4. **Spacing**: day-to-day separation = 16px; header→first run = 6px;
   run→run = 8px + hairline; container padding 12px horizontal. Target: a
   7-day week with 4 runs + 2 rest days fits in ~1100px (vs ~1800 today).
5. Day pills strip stays as-is (owner likes it).
6. Tap targets: whole run row is the tap target (opens detail per the
   existing divergence: sheet on mobile) — ≥44px guaranteed by design.

Desktop untouched. Month selection panel reuses RunList so it inherits the
compact rows automatically — verify.

## Acceptance

- 375px screenshots: no double-frame nesting visible; a 1-run day ≤ ~120px
  total (header + row); rest day = one 32px line; whole week ≈ ≤1200px.
- All content preserved (name, time, status, metrics incl. ≈, tags where
  fitting) — nothing dropped, only compacted.
- AA contrast; tokens only; 44px row targets; both themes.
- Tests: week-view pure models updated for compact rollups; all green.
