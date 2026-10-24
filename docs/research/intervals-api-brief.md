# intervals.icu API — Technical Brief for AI-Coach Running App

Researched 2026-10-24 against the live API (athlete `i167187`), the official OpenAPI spec (`GET https://intervals.icu/api/v1/docs`, 119 paths, OpenAPI 3.0.1), and the official forum thread. `api-docs.html` is just a RapiDoc shell that loads that spec — fetch the spec directly.

**Base URL:** `https://intervals.icu/api/v1/`

## 0. THE BIG TRAP (confirmed live)

- The **calendar** is the **`events`** resource. Creating a planned run = `POST /athlete/{id}/events` with an `EventEx` body.
- `POST /athlete/{id}/activities` is **file upload only** (fit/tcx/gpx multipart). It will NOT create a planned activity.
- `POST /athlete/{id}/activities/manual` creates a *recorded* (past) activity, not a plan.
- The **Workout Builder library** (`/athlete/{id}/workouts`, `/folders`) is a separate reusable-templates store. You do not need it to schedule a run. (Caveat from forum: workout-doc parsing for library workouts is client-side; library workouts must be opened in the app once before format conversion / Garmin sync. Calendar *events* compute load server-side — verified live.)

## 1. Auth & rate limits

**Basic auth — username is the literal string `API_KEY`, password is the key.** Verified live: `-u "API_KEY:<key>"` works; `-u "i167187:<key>"` (athlete-id username) returns `401 Auth failed`.

- API key from Settings → Developer. Athlete id `0` is an alias for "the key owner" (`/athlete/0/...`).
- OAuth (Bearer) exists for multi-user apps (100 req/user/day default; API-key path is fine for single-athlete).
- **Rate limits (API key):** 5,000 requests/day, 2,500 per rolling 15 min, plus 10 req/s per IP (no headers for this one). Daily resets midnight UTC.
- Headers on responses: `X-RateLimit-Limit: <15m>,<daily>`, `X-RateLimit-Remaining: <15m>,<daily>`; 429 includes `Retry-After` (seconds).
- Cloudflare in front of intervals.icu may block default library user-agents — **set a browser-like `User-Agent`** (relevant from a Worker too).

## 2. Endpoint table (what the app needs)

| Purpose | Method & path | Notes |
|---|---|---|
| Athlete self | `GET /athlete/{id}` | id `0` = self. Returns profile, tz, units, `icu_permission` |
| **Calendar read** | `GET /athlete/{id}/events?oldest=YYYY-MM-DD&newest=YYYY-MM-DD` | Planned workouts, races, notes. Defaults: oldest=today (athlete tz), newest=oldest+6d. `category=` filter, `limit`, `ext=zwo|mrc|erg|fit` converts workout, `resolve=true` resolves zone targets to paces/bpm |
| **Create planned** | `POST /athlete/{id}/events?upsertOnUid=<bool>` | Body = `EventEx` (below). Returns created event incl. computed load |
| Bulk create | `POST /athlete/{id}/events/bulk?upsert=&upsertOnUid=&updatePlanApplied=` | Body = array of `EventEx` |
| Update / delete one | `PUT` / `DELETE /athlete/{id}/events/{eventId}` | also `GET` single |
| Delete range | `DELETE /athlete/{id}/events?oldest=&newest=&category=` | |
| Mark done | `POST /athlete/{id}/events/{eventId}/mark-done` | Creates a manual activity matching the plan |
| **Recorded activities** | `GET /athlete/{id}/activities?oldest=YYYY-MM-DD&newest=&limit=&fields=` | Desc date order. **Recorded only** — verified: future window returns `[]` |
| Single activity | `GET /activity/{id}` (`PUT`, `DELETE` also) | id like `i199756190`; `?intervals=true` adds detected intervals |
| Wellness day | `GET /athlete/{id}/wellness/{date}`; range `GET /athlete/{id}/wellness?oldest=&newest=` | Write: `PUT /athlete/{id}/wellness/{date}` or `/wellness-bulk` |
| Zone / threshold config | `GET /athlete/{id}/sport-settings` | Per-sport: hr_zones, pace_zones, lthr, threshold_pace, names… |
| Workout library (skip) | `/athlete/{id}/workouts`, `/folders` | Reusable templates; not needed for scheduling |

## 3. Calendar model: planned vs recorded

Two parallel collections linked by id:

- **Event** (`/events`) = calendar entry: planned workout, race, note, holiday, sickness… Has `category` enum: `WORKOUT | RACE_A | RACE_B | RACE_C | NOTE | PLAN | HOLIDAY | SICK | INJURED | SET_EFTP | FITNESS_DAYS | SEASON_START | TARGET | SET_FITNESS`.
- **Activity** (`/activities`) = recorded session (device sync / manual upload). Boolean `race` flag, `sub_type` enum incl. `RACE` (`NONE|COMMUTE|WARMUP|COOLDOWN|RACE`), `source` (e.g. `"COROS"`), `compliance`, and **`paired_event_id`** pointing at the event it fulfils. The event side gets `paired_activity_id`.
- A day can have both; the plan survives after completion. **Race = event `category: "RACE_A|B|C"`** (A = highest priority) for planning; the recorded activity then carries `race: true`.
- Event times: full `HH:mm:ss` supported (live data has 06:00, 17:45 starts); the old forum note about "must be T00:00:00" is outdated. Dates are **athlete-local**, no timezone offset in the string.

### Key event JSON fields (verified)

`id`, `uid` (UUID — enables idempotent upsert), `start_date_local`, `end_date_local`, `type` (`"Run"` — same sport-type enum as Strava: Run, Ride, TrailRun, VirtualRun, …), `sub_type`, `category`, `name`, `description` (**parsed server-side into structure since 2021 — see §4**), `indoor`, `color`, `distance` (m), `moving_time` (s), `icu_training_load` (planned load), `icu_intensity`, `icu_atl`/`icu_ctl` (resulting fitness after the event), `target` (`AUTO|POWER|HR|PACE`), `workout_doc` (structured steps, see below), `tags[]`, `load_target`/`time_target`/`distance_target`, `show_as_note`, `not_on_fitness_chart`, `for_week`, `training_availability` (`NORMAL|LIMITED|UNAVAILABLE`), `created_by_id`, `plan_*` fields (if from a plan), `paired_activity_id`.

### Key activity JSON fields (verified)

`id` (string `i…`), `name`, `start_date_local`, `type`, `sub_type`, `race` (bool), `distance`, `moving_time`, `elapsed_time`, `average_heartrate`, `max_heartrate`, `average_speed`, `pace` (min/km), `gap`, `icu_training_load`, `icu_intensity` (% of threshold effort), `trimp`, `hr_load`, `pace_load`, `power_load`, `icu_ctl`/`icu_atl` (fitness that day), `icu_hr_zone_times`, `icu_hr_zones`, `pace_zone_times`, `pace_zones`, `icu_zone_times`, `gap_zone_times`, `icu_power_zones`, `threshold_pace`, `icu_ftp`, `lthr`, `paired_event_id`, `source`, `device_name`, `feel`, `perceived_exertion`, `icu_rpe`, `session_rpe`, `total_elevation_gain`, run dynamics (cadence, stance time, vertical oscillation, leg spring stiffness…), weather, `gear`.

## 4. Creating a planned activity — the AI-coach write

`POST /athlete/{id}/events?upsertOnId=<bool>` … actually query is **`upsertOnUid`** (boolean, marked required in spec — pass `false` to always-create, or `true` + your own `uid` for idempotent create-or-update, ideal for an AI coach re-planning).

**Minimal body (from official forum example, still valid):**

```json
{
  "start_date_local": "2026-11-03T06:00:00",
  "category": "WORKOUT",
  "type": "Run",
  "name": "Tempo run",
  "description": "Warmup\n- 3km Z2 Pace\n\nMain Set 3x\n- 5m Z4 Pace\n- easy jog 2m Z1 Pace\n\nCooldown\n- 2km Z1 Pace",
  "moving_time": 3600
}
```

**The magic:** `description` is parsed by intervals.icu into a structured workout. Verified live on this athlete's calendar — the free-text above produces `workout_doc`, computed `icu_training_load`, `icu_intensity`, and `zoneTimes`. Syntax seen working: section lines (`Warmup`, `Main Set Nx`, `Cooldown`), step lines `- <duration|distance> Zone<N> Pace|HR|Watts`, nested reps. For a race: `"category": "RACE_A"` (or B/C).

**Full `EventEx` field set** (= Event + 4 extras: `workout` {id of library workout}, `filename` + `file_contents`/`file_contents_base64` (zwo/mrc/erg)). All fields optional per spec; no `required` array. Notable writables beyond minimal: `uid`, `end_date_local`, `distance`, `target`, `load_target`/`time_target`/`distance_target`, `indoor`, `tags`, `color`, `show_as_note`, `not_on_fitness_chart`, `atl_days`/`ctl_days`/`icu_ftp`/`w_prime`/`p_max` (override fitness params for that event), `carbs_per_hour`, `sub_type`, `workout_doc` (full structured doc — can be sent directly instead of relying on description parsing), `plan_*`, `training_availability`, `max_training_time`, `can_train_sports`.

**`workout_doc` shape (from live planned run):**

```json
"workout_doc": {
  "steps": [
    { "pace": { "units": "pace_zone", "value": 2 }, "warmup": true, "distance": 3000, "duration": 981 },
    { "reps": 4, "text": "Main Set 4x", "steps": [
        { "pace": { "units": "pace_zone", "value": 5 }, "text": "Fast", "duration": 20 },
        { "pace": { "units": "pace_zone", "value": 1 }, "text": "easy jog", "duration": 40 } ],
      "distance": 714.7, "duration": 240 },
    { "pace": { "units": "pace_zone", "value": 1 }, "cooldown": true, "distance": 3000, "duration": 1161 }
  ],
  "distance": 6714.7, "duration": 2382,
  "zoneTimes": [ { "id": "Z1", "secs": 1321 }, { "id": "Z2", "secs": 981 }, { "id": "Z5", "secs": 80 }, … ]
}
```

Target units: `pace_zone` / `power_zone` / `hr_zone` with `value: N` (or `start`/`end` for ranges — the marathon event used `{"start":2,"end":3,"units":"pace_zone"}`). Steps support `duration` (s), `distance` (m), `reps`+nested `steps`, `text`, `warmup`/`cooldown` flags. **Recommendation: write the human-readable `description` (server parses it) — simplest and it's what renders on the calendar; fall back to `workout_doc` only if parse fidelity matters.**

## 5. Races

- Planning: event **`category: "RACE_A" | "RACE_B" | "RACE_C"`** (priority tiers; UI colors them as races). Everything else identical (name, description, distance, type).
- Recorded: activity **`race: true`** boolean + optional `sub_type: "RACE"`.
- Note: this athlete's "3-Länder-Marathon" was entered with `category: "WORKOUT"` — races only show as races if categorized correctly. The AI coach should set `RACE_A` for goal races.

## 6. Wellness (per day)

`GET /athlete/{id}/wellness?oldest=&newest=` → array keyed by `id` = `YYYY-MM-DD`. Fields (47): `ctl`, `atl`, `rampRate`, `ctlLoad`, `atlLoad` (daily loads), `sportInfo[]` (per-sport `eftp`/`wPrime`/`pMax`), `weight`, **`restingHR`**, **`hrv`**, `hrvSDNN`, **`sleepSecs`**, `sleepScore`, `sleepQuality`, `avgSleepingHR`, subjective 1–10: `fatigue`, `soreness`, `mood`, `stress`, `motivation`, `injury`, plus `readiness`, `spO2`, `systolic`/`diastolic`, `hydration`, `vo2max`, `steps`, `respiration`, `comments`, `locked`, menstrual tracking. Garmin writes many of these automatically (this athlete gets restingHR/hrv/sleepSecs from Garmin).

**Form/TSB is NOT a returned field — compute client-side: `form = ctl − atl`** (intervals.icu's own convention; sign gives "fresh/neutral/fatigued" bands). Fitness = `ctl`, Fatigue = `atl`, both also embedded per-activity/per-event as `icu_ctl`/`icu_atl` (state *after* that day).

## 7. Zones

**Time-in-zone on activities — three representations (all verified on one run):**

| Field | Shape | Meaning |
|---|---|---|
| `icu_zone_times` | `[{id:"Z1",secs:706},…,{id:"Z7"},{id:"SS"}]` | Primary zone times, Z1–Z7 + SS (sweet spot), object form |
| `icu_hr_zone_times` | `[560,650,851,852,30,0]` | Array of secs, **index-aligned with `icu_hr_zones`** (6 bounds → N+1 zones) |
| `pace_zone_times` | `[1197,363,315,235,54,173,611]` | Array aligned with `pace_zones` (7 bounds) |
| `gap_zone_times` | same | Grade-adjusted pace zones (run) |

Planned events: `workout_doc.zoneTimes` (Z1–Z7 object form).

**Zone configs:** `GET /athlete/{id}/sport-settings` → array per sport-group. Run example (live): `lthr: 180`, `max_hr: 203`, `hr_zones: [143,162,171,183,190,203]`, `hr_zone_names: ["Recovery","Aerobic","Tempo","Threshold","Aerobic Endurance","Anaerobic Power"]`, `threshold_pace: 3.7037` (min/km), `pace_zones: [77.5,87.7,94.3,100,103.4,111.5,999]` — **percent of threshold pace**, 100 = threshold), `pace_zone_names: ["Zone 1"…"Zone 5c"]`, `pace_units: "MINS_KM"`, `hr_load_type: "HRSS"`, `pace_load_type: "RUN"`, `load_order`/`tiz_order`, `gap_model: "STRAVA_RUN"`, `ftp`/`power_zones` for power sports. Spec also defines generic `ZoneSet {code, zones:[ZoneInfo{id,start,end,secs}]}` / `ZoneTime {id, secs}` schemas.

## 8. Real JSON examples (live, truncated)

**Planned event (future, structured):**

```json
{
  "id": 147702963,
  "uid": "ff161adf-0b0c-4890-81dc-a0003c4f3574",
  "start_date_local": "2026-10-27T17:45:00",
  "end_date_local": "2026-10-27T18:32:18",
  "type": "Run", "category": "WORKOUT",
  "name": "Run club — 10×(1' Z3 / 1' easy) + 5×(2' Z3 / 30\" walk)",
  "description": "Warmup\n- 1.5km Z2 Pace\n\nMain Set 10x\n- Steady 1m Z3 Pace\n…",
  "distance": 8481.944, "moving_time": 2827,
  "icu_training_load": 52, "icu_intensity": 81.37,
  "icu_atl": 41.07, "icu_ctl": 41.41,
  "workout_doc": { "steps": [ /* §4 example */ ],
    "zoneTimes": [{ "id": "Z1", "secs": 1137 }, { "id": "Z2", "secs": 490 }, { "id": "Z3", "secs": 1200 }] },
  "athlete_id": "i167187", "created_by_id": "i167187",
  "paired_activity_id": null, "training_availability": "NORMAL"
}
```

**Recorded activity (past, paired):**

```json
{
  "id": "i199756190",
  "start_date_local": "2026-10-20T17:47:53",
  "type": "Run", "sub_type": null, "race": false, "source": "COROS",
  "name": "Run club — 10×(1' hard / 1' easy) + …",
  "distance": 8823.44, "moving_time": 2935, "elapsed_time": 3649,
  "average_heartrate": 156, "max_heartrate": 186, "pace": 3.006283,
  "icu_training_load": 92, "icu_intensity": 106.0, "trimp": 79.78,
  "icu_ctl": 41.54, "icu_atl": 38.67,
  "icu_hr_zones": [143,162,171,183,190,203], "icu_hr_zone_times": [560,650,851,852,30,0],
  "pace_zones": [77.5,87.7,94.3,100.0,103.4,111.5,999.0], "pace_zone_times": [1197,363,315,235,54,173,611],
  "icu_zone_times": [{ "id": "Z1", "secs": 706 }, { "id": "Z4", "secs": 555 }, { "id": "SS", "secs": 469 }],
  "threshold_pace": 3.7037036, "paired_event_id": 145969946
}
```

**Wellness day:**

```json
{
  "id": "2026-10-24", "ctl": 41.87, "atl": 43.38, "rampRate": 0.91,
  "ctlLoad": 116.0, "atlLoad": 116.0,
  "sportInfo": [{ "type": "Run", "eftp": 274.35, "wPrime": 23430.92, "pMax": 693.33 }],
  "restingHR": 50, "hrv": 61.0, "sleepSecs": 28080,
  "weight": null, "fatigue": null, "mood": null, "readiness": null
}
```

## 9. SDK assessment: `intervals-icu-sdk` (jcurbelo)

**Facts:** v0.3.0 on npm (published 2026-10-12, ~38 downloads/week, 1 GitHub star, 17 commits, single maintainer). Generated from the official spec with `@hey-api/openapi-ts`; **zero runtime dependencies** (fetch-based client bundled); ESM + CJS + `.d.ts`; MIT. Covers all 148 operations incl. `listEvents`, `createEvent` (body typed as EventEx), `updateEvent`, `deleteEvent`, `markEventAsDone`, `listActivities`, `listWellnessRecords`, `listSportSettings`. Result style `{data, error, request, response}` (opt-in `throwOnError`); `configureIntervals({apiKey})` or `createClient({auth})`; injectable `fetch`. CI regenerates + a weekly spec-drift job. README claims Node ≥18 / Bun / Deno / edge runtimes.

**Cloudflare Workers fit:** technically fine — pure fetch, no node builtins, tree-shakeable, `sideEffects: false`.

**Risks:** 2-week-old 0.x project, one maintainer, negligible adoption; generated Event/EventEx types come from a spec whose schemas have no `required` arrays, so type-safety on POST bodies is shallow (everything optional); an extra dependency to audit.

**Recommendation: use the SDK for types-only or skip it; hand-roll a thin fetch client for the ~6 endpoints the app needs.** The app's API surface is tiny (events GET/POST, activities GET, wellness GET, sport-settings GET, athlete GET), auth is one `Authorization: Basic btoa("API_KEY:"+key)` header, and the OpenAPI spec is downloadable — you can generate or paste the exact `EventEx`/`Activity`/`Wellness` TS interfaces from it (they're in this repo's spec copy at `.scratch/research/openapi.json`, and in the SDK's `src/gen/types.gen.ts`). A ~100-line typed client with 429/Retry-After handling and a browser-like UA gives full control and zero supply-chain exposure. If you want IDE types without runtime coupling: `import type { EventEx, Activity, Wellness } from "intervals-icu-sdk"` and still ship your own fetch code.
