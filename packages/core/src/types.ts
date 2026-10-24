/**
 * Domain types for intervals.icu, transcribed from the official OpenAPI spec
 * (snapshot in docs/research/ + .scratch/research/openapi.json) and verified
 * against live data for athlete i167187 on 2026-10-24. See
 * docs/research/intervals-api-brief.md — THE reference for field semantics.
 *
 * NAMING TRAP (docs/adr/0002): the calendar is the *events* resource.
 * A planned run is an Event with category WORKOUT. A race is an Event with
 * category RACE_A|B|C. The /workouts library is a separate reusable-template
 * store that this app does not use. Recorded sessions are *activities* and
 * are linked to their plan via paired_event_id / paired_activity_id.
 */

// ---------- Events (calendar entries: planned workouts, races, notes) ----------

export const EVENT_CATEGORIES = [
  'WORKOUT',
  'RACE_A',
  'RACE_B',
  'RACE_C',
  'NOTE',
  'PLAN',
  'HOLIDAY',
  'SICK',
  'INJURED',
  'SET_EFTP',
  'FITNESS_DAYS',
  'SEASON_START',
  'TARGET',
  'SET_FITNESS',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const RACE_CATEGORIES: readonly EventCategory[] = ['RACE_A', 'RACE_B', 'RACE_C'];

export const SPORT_TYPES = [
  'Run',
  'TrailRun',
  'VirtualRun',
  'Ride',
  'VirtualRide',
  'Swim',
  'Row',
  'Walk',
  'Hike',
  'Ski',
  'Other',
] as const;
export type SportType = (typeof SPORT_TYPES)[number];

/** Structured workout step, as parsed by intervals.icu from `description`. */
export interface WorkoutStep {
  text?: string;
  duration?: number; // seconds
  distance?: number; // meters
  reps?: number;
  steps?: WorkoutStep[];
  warmup?: boolean;
  cooldown?: boolean;
  pace?: { units: 'pace_zone' | 'power_zone' | 'hr_zone'; value?: number; start?: number; end?: number };
  hr?: { units: string; value?: number; start?: number; end?: number };
  power?: { units: string; value?: number; start?: number; end?: number };
}

export interface WorkoutDoc {
  steps: WorkoutStep[];
  distance?: number;
  duration?: number;
  zoneTimes?: ZoneTime[];
}

export interface ZoneTime {
  id: string; // "Z1".."Z7", "SS"
  secs: number;
}

/**
 * EventEx — the POST/PUT body for calendar writes. All fields optional per
 * spec; the app's validators (proposal.ts) enforce the subset we care about.
 * `description` is parsed SERVER-SIDE into a structured workout, so write the
 * human-readable description and let intervals.icu compute load/zone times.
 */
export interface EventEx {
  id?: number;
  /** UUID we generate — with ?upsertOnUid=true makes AI re-planning idempotent. */
  uid?: string;
  /** Athlete-local date-time, no offset. e.g. "2026-11-03T06:00:00" */
  start_date_local: string;
  end_date_local?: string;
  type?: SportType;
  sub_type?: string | null;
  category?: EventCategory;
  name?: string;
  /** Free-text workout spec — parsed server-side (sections + "- <dur> Z<N> Pace" steps). */
  description?: string;
  indoor?: boolean;
  color?: string | null;
  distance?: number; // meters (planned)
  moving_time?: number; // seconds (planned)
  target?: 'AUTO' | 'POWER' | 'HR' | 'PACE';
  load_target?: number | null;
  time_target?: number | null;
  distance_target?: number | null;
  icu_training_load?: number; // computed (planned)
  icu_intensity?: number;
  icu_atl?: number;
  icu_ctl?: number;
  workout_doc?: WorkoutDoc | null;
  tags?: string[];
  show_as_note?: boolean;
  not_on_fitness_chart?: boolean;
  training_availability?: 'NORMAL' | 'LIMITED' | 'UNAVAILABLE';
  max_training_time?: number | null;
  paired_activity_id?: number | null;
  athlete_id?: string;
  created_by_id?: string;
}

// ---------- Activities (recorded sessions) ----------

export interface Activity {
  id: string; // "i199756190"
  name?: string;
  start_date_local: string;
  type?: SportType;
  sub_type?: string | null;
  race?: boolean;
  source?: string; // e.g. "COROS"
  device_name?: string | null;
  distance?: number; // meters
  moving_time?: number; // seconds
  elapsed_time?: number;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_speed?: number | null;
  pace?: number | null; // min/km
  gap?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  trimp?: number | null;
  hr_load?: number | null;
  pace_load?: number | null;
  power_load?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  /** secs per zone, index-aligned with icu_hr_zones bounds array */
  icu_hr_zone_times?: number[];
  icu_hr_zones?: number[];
  /** secs per zone, index-aligned with pace_zones (percent-of-threshold bounds) */
  pace_zone_times?: number[];
  pace_zones?: number[];
  /** object form, primary zones Z1..Z7 + SS */
  icu_zone_times?: ZoneTime[];
  threshold_pace?: number | null;
  icu_ftp?: number | null;
  lthr?: number | null;
  paired_event_id?: number | null;
  feel?: number | null;
  perceived_exertion?: number | null;
  icu_rpe?: number | null;
  session_rpe?: number | null;
  total_elevation_gain?: number | null;
}

// ---------- Wellness (per day, key = YYYY-MM-DD) ----------

export interface WellnessDay {
  id: string; // "2026-10-24"
  ctl?: number | null; // fitness
  atl?: number | null; // fatigue
  rampRate?: number | null;
  ctlLoad?: number | null;
  atlLoad?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  hrvSDNN?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  sleepQuality?: number | null;
  avgSleepingHR?: number | null;
  fatigue?: number | null; // subjective 1–10
  soreness?: number | null;
  mood?: number | null;
  stress?: number | null;
  motivation?: number | null;
  injury?: number | null;
  readiness?: number | null;
  weight?: number | null;
  spO2?: number | null;
  steps?: number | null;
  comments?: string | null;
}

// ---------- Athlete / zones config ----------

export interface SportSettings {
  type?: string;
  lthr?: number | null;
  max_hr?: number | null;
  hr_zones?: number[];
  hr_zone_names?: string[];
  threshold_pace?: number | null; // min/km
  pace_zones?: number[]; // percent of threshold pace
  pace_zone_names?: string[];
  pace_units?: string;
  ftp?: number | null;
  power_zones?: number[];
}

export interface Athlete {
  id: string;
  name?: string;
  timezone?: string | null;
  units?: string | null;
}

// ---------- App-side calendar projection (what the UI renders) ----------

/**
 * A day cell in the app calendar: the planned Event (if any) merged with the
 * recorded Activity (if any) that fulfilled it. Independent entries are kept
 * separate; pairing is by activity.paired_event_id.
 */
export interface CalendarEntry {
  date: string; // YYYY-MM-DD (athlete-local)
  event?: EventEx;
  activity?: Activity;
  isRace(): boolean;
}
