# Week View v2 — design spec (day pills, run cards, divergent detail flows)

Author: orchestrator (vision session), 2026-10-25. From the owner's review
("floating text in a card — we need cards with titles and better dividers")
+ the four reference boards (dark day-pill app; light run-rows app with date
badges and type tags; analytics card-grid; pastel schedule cards).
Companion to `docs/design/calendar-home-v2-spec.md` (hero/stats — done).

## What's wrong today

The week view is one card where each day is an indented text block and each
run is a dot-separated line ("✓ 7.3km · 38m · 3:08/km · 156bpm · load 61").
No titles, no visual anchors, no scannable structure. It cannot expand into
rich detail without becoming more text.

## Target design

### 1. Day-strip (new, top of the week card)
Seven day pills (Mon–Sun, from the dark reference board): each pill shows
weekday letter + date number, with markers underneath: ✓ recorded dot
(success), planned dot (accent outline), race marker (race color), today =
filled pill. Tapping a pill scrolls that day's card into view AND selects it
(also updates the month-view panel when in month mode). Selected pill = filled.

### 2. Day cards — titled, separated, structured
Each day becomes its own **DayCard** inside the week container (hairline
separators stay, but each card has real anatomy):
- **Header row**: weekday + date ("Tuesday 20") left; right side = day rollup
  chips ("2 runs · 10.5km · load 108") or "Rest day" pill.
- **Run cards**: each run/session is a RunCard —
  - Left edge: 3px intensity accent (zone color of the session's dominant
    zone; planned = accent outline style).
  - Title row: session name (semibold) + status chip (DONE ✓ / PLANNED /
    MISSED / RACE — colored chips per type; race chip uses race token).
  - **Metric grid** (replaces the dot-line): 2×2 or 4-across micro-columns,
    each a labeled value — DISTANCE 8.8km · TIME 48m · PACE 3:00/km · HR 156 ·
    LOAD 92 (labels 10px small-caps muted, values tabular semibold). Missing
    metrics omitted, never dashed.
  - Optional: type tag chip (Tempo/Easy/Long) derived from name/category when
    confident; skip when not.
- Rest days: slim row with a moon/zzz icon + "Rest day" — visually quiet.
- **Desktop week layout**: 7 DayCards may render 2-per-row grid at ≥900px if
  the single column gets too tall; keep 1-col on mobile. (Pick during build;
  both are acceptable.)

### 3. Divergent detail flows (the core interaction change)
Extract the day-detail content from `app/(app)/calendar/day.tsx` into a
shared `DayDetails` component (events, workouts w/ WorkoutTimeline, recorded
metrics, zone bar). Then:

- **Desktop (≥900px)**: tapping a RunCard/DayCard opens a **side panel that
  animates in to the RIGHT** of the week list (inside the calendar screen;
  the list column narrows, panel slides/fades in ~200ms; close = X or tap
  another day). Renders `DayDetails` for that day. Deep navigation to the
  `/calendar/day` route stays available via an "open full" affordance
  (deep-linkable URL preserved).
- **Mobile (<900px) + native**: tapping opens the **bottom sheet** (reuse the
  ProposalModal chassis: slide-up, grab handle, scrim) rendering `DayDetails`
  with edit affordances and close-by-drag/X. The `/calendar/day` route
  remains for deep links but the primary tap flow is the sheet.
- Both: only one detail open at a time; switching days re-targets in place.

### 4. Components to add
- `DayStrip` (pills) · `RunCard` · `DayCard` · `DetailSidePanel` (desktop,
  animated) · `DetailSheet` (mobile, animated) · `DayDetails` (extracted from
  day.tsx; shared by route, panel, sheet). All tokens-only; animations via the
  existing motion.tsx patterns (SlideFadeIn / layout animation), 180-220ms.

### 5. Rules
- No dot-separated metric lines anywhere in the week view.
- Estimates keep ≈ marks; load never fabricated.
- AA contrast; hit targets ≥44pt; both themes; 375 + 1280.
- Keep data plumbing unchanged (same queries; purely presentational +
  interaction layer).

## Acceptance
- Week card shows day pills; day cards have titled headers + run cards with
  metric grids; no indented dot-lines (grep for the '·'-joined pattern in
  the week rendering).
- Desktop: tapping a run opens the right-side panel with animation; mobile:
  bottom sheet; both render the same DayDetails content.
- Parity: qa-parity re-run — web vs APK look the same on the new components
  (sheet on native, side panel on web, by design).
- All tests green; new pure logic (rollup chips, zone-accent pick) tested.
