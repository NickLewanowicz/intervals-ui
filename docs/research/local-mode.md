# Local-only mode + multi-platform builds (design brief)

Filed as Gitea issue #14. Written from Nick's direction, 2026-10-24.

> **Status update (round-2 design pass, 2026-10-24):** the *web vs native
> home split* described below is now implemented — `app/(marketing)/index.tsx`
> redirects to `/sign-in` when `Platform.OS !== 'web'` (with a code comment
> pointing here), and the sign-in "Back" link is web-only. The static export
> still ships the `/` route for the web deployment; native builds simply never
> reach it. The rest of this brief (local data source, secure-store keys,
> desktop packaging) remains open.

## The feature

The app installs as a **native app on iOS, Android, macOS, and Windows**. On
those platforms, signing in must be **optional**:

- **Signed in (Google):** everything works as today — PocketBase holds the
  user, keys, mirrors, chat history; the Worker does coach calls + syncs.
- **Local-only (no sign-in):** the app is fully self-contained on-device.
  Chat runs on the machine (BYO OpenRouter key held locally), conversations
  are saved locally, the intervals.icu cache is local. **Nothing ever goes to
  PocketBase** — PocketBase is reserved for authenticated users. The
  intervals.icu API key is still required (the data has to come from
  somewhere) but is stored only in local secure storage. The coach's
  tool-call loop + validation run client-side (the validators already live in
  `@intervals/core`); calendar writes go **directly to intervals.icu from the
  device** with the user's own key (still through the same proposal-modal
  steering — no behavior change, only the transport differs).
- **Web export: local-only is NOT supported.** The web deployment always
  requires sign-in (CORS + key exposure on the open web make local-only
  wrong there).

## Web vs native home split

The web deployment keeps the marketing splash (`(marketing)/index`); native
builds skip it — app opens directly on sign-in (with a "continue local"
secondary action). Mechanism in one Expo codebase:

- Route-level: gate the marketing group behind `Platform.OS === 'web'`
  checks in the root layout/initial route decision
  (`expo-router` initial route can be chosen in `app/_layout.tsx` via
  `<Stack>` + redirect logic; static export builds all routes but native
  never navigates to the marketing group).
- Cleaner: `process.env.EXPO_OS` / `Constants.executionEnvironment` +
  `Platform.OS` conditionals in the root layout; the marketing group is
  simply unreachable on native.
- This is a small, testable conditional — no EAS build profiles needed
  (though EAS profiles could later strip the route entirely via
  `EXPO_PUBLIC_SKIP_MARKETING` env baked at build time).

## Architecture seams (what makes this a config, not a fork)

The codebase already has the right seams; local mode plugs in as an
alternative implementation of the same interfaces:

| Concern | Signed-in impl | Local-only impl |
|---|---|---|
| Identity/auth | PocketBase `users` + token | local profile record (name optional) |
| Key storage | PB hidden fields (server) | expo-secure-store (device keychain) |
| Calendar/activities/wellness reads | PB mirrors | on-device SQLite/JSONL cache filled by direct intervals.icu GETs |
| Coach chat | Worker `/api/chat` (holds keys) | device → OpenRouter direct + `@intervals/core` validators client-side; history in local DB |
| Proposal apply | Worker → intervals.icu | device → intervals.icu directly |
| Sync | Worker cron + manual | device foreground/pull-to-refresh |

Everything above the seam (screens, ProposalModal, digests — `coach.ts` runs
anywhere) is unchanged. The data layer becomes a策略 provider chosen at boot:
`remote-data-source.ts` (today) vs `local-data-source.ts` (new).

## Sizing + order

1. Extract the data-layer seam (refactor `lib/queries.ts` + `lib/api.ts`
   behind an interface) — prerequisite for both features.
2. Local data source (SQLite via expo-sqlite, secure-store for keys, direct
   intervals client, local chat store, client-side tool loop).
3. Platform conditionals (marketing route, sign-in variants, "continue
   local" action).
4. EAS build profiles for ios/android; Tauri or Electron wrapper evaluation
   for macOS/Windows (expo native windows/mac via react-native-windows/macOS
   exist but are heavier; Tauri reusing the web export is likely the
   pragmatic desktop path — decide in the issue, not now).
5. Settings gains an account section distinguishing "Local profile" vs
   signed-in, with a one-way "upgrade to synced" migration (push local cache
   → PB on first sign-in).

Open questions for the vision/design session: whether local mode shows any
onboarding differences, and where the "continue local" affordance lives on
the sign-in screen.
