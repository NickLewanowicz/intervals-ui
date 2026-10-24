# Design language (seed — vision session owns the real version, issue V-06)

This is the non-vision scaffold's starting point. The vision-capable session
should treat everything here as provisional and rewrite it with eyes on the
rendered app; what matters is that the *system* (tokens, not literals)
survives.

## Principles (product-level, from the SPEC)

1. **Calendar-first**: the week view is the home screen; everything else
   serves it. Information density over decoration — a training calendar is a
   tool, not a landing page (the splash is the exception; see V-01).
2. **Planned vs actual is the visual core**: every representation must make
   "what was planned / what happened" instantly separable.
3. **Races shout**: RACE_A/B/C must be identifiable from across the room.
4. **Calm data, confident chrome**: dark-first, grayscale surfaces, one
   accent for actions, semantic color reserved for race/intensity.
5. **Trust through explicitness**: the proposal modal shows exactly what will
   be written; the chat always says what it did NOT write.

## Token seed (apps/expo/src/theme.ts)

- bg `#111318` · card `#1c1f26` · border `#2a2e37`
- text `#f2f4f8` · muted `#9aa1ad`
- accent (actions) `#4a90d9` · success `#2da44e` · danger `#d9534f`
- race `#e0a458` (A), high-intensity `#d9534f`, easy/low `#2da44e`
- type: system stack; scale 13/15/17/22/28/36; tabular numerals for stats
- spacing: 4px grid (4/8/12/16/24/32/48); radius 10/16; press states ≥44pt

## Reference teardown (to be done in V-06)

intervals.icu (dense, expert), Strava (consumer-clean), TrainingPeaks
(coach-grade). Record what we borrow and why.
