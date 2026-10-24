# ADR-0002 — Calendar writes are `events` (EventEx), never `workouts` or `activities`

Date: 2026-10-24 · Status: Accepted

## Context

intervals.icu naming is a trap (verified live; see
`docs/research/intervals-api-brief.md` §0):

- **Events** (`/athlete/{id}/events`) are calendar entries: planned workouts,
  races, notes. `POST` with an `EventEx` body creates one.
- **Activities** (`/athlete/{id}/activities`) are *recorded* sessions; `POST`
  there is file-upload only (fit/tcx/gpx) or `/manual` for a logged past
  session. It will NOT schedule anything.
- **Workouts** (`/athlete/{id}/workouts`) are reusable Workout-Builder
  templates in folders — a library, not the calendar. (Forum caveat: library
  workout parsing needs the web app to open them once; calendar events are
  parsed server-side.)
- Races are not a type: an event with `category: RACE_A|B|C` (A = goal race).

## Decision

1. All coach writes are `events` writes: `propose_event` → POST
   `/events?upsertOnUid=true` with a deterministic `uid` (coachUid) —
   idempotent re-planning, no duplicates. Updates/deletes reference the
   numeric event id shown in the coach's calendar digest.
2. The coach writes the human-readable **`description`** (intervals.icu
   parses it server-side into `workout_doc`, computes load/zone times). We do
   not hand-build `workout_doc` JSON.
3. Races: `category: RACE_A/B/C` on race day, `type: "Run"` unless stated.
4. Recorded activities are read-only for us (device syncs land there via
   Garmin/Coros → intervals.icu).

## Consequences

- `packages/core/proposal.ts` validators encode exactly this surface; the LLM
  tool schemas mirror it 1:1.
- The EventEx field set allowed to the model is deliberately small
  (start/category/type/name/description/distance/moving_time/uid/id) —
  load/target overrides stay out of the AI's hands.
