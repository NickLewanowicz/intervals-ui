/**
 * PB mirror rows → @intervals/core domain objects. Pure mapping (unit
 * tested). Mirror columns are authoritative; the `data` json (full upstream
 * event/activity) fills anything the mirror doesn't project.
 */
import type {
  Activity,
  EventCategory,
  EventEx,
  WellnessDay,
  WorkoutDoc,
  ZoneTime,
} from '@intervals/core';

type Json = Record<string, unknown> | null | undefined;

/** Shape of a calendar_events row as returned by the PB SDK. */
export interface PbEventRow {
  id: string;
  intervals_id?: number | null;
  uid?: string | null;
  start_date_local?: string | null;
  end_date_local?: string | null;
  category?: string | null;
  type?: string | null;
  name?: string | null;
  description?: string | null;
  distance?: number | null;
  moving_time?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  paired_activity_id?: number | null;
  workout_doc?: Json;
  data?: Json;
}

/** Shape of an activities row as returned by the PB SDK. */
export interface PbActivityRow {
  id: string;
  intervals_id?: string | null;
  start_date_local?: string | null;
  name?: string | null;
  type?: string | null;
  race?: boolean | null;
  distance?: number | null;
  moving_time?: number | null;
  average_heartrate?: number | null;
  pace?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  icu_ctl?: number | null;
  icu_atl?: number | null;
  zone_times?: ZoneTime[] | null;
  hr_zone_times?: ZoneTime[] | null;
  pace_zone_times?: ZoneTime[] | null;
  paired_event_id?: number | null;
  source?: string | null;
  data?: Json;
}

/** Shape of a wellness row as returned by the PB SDK. */
export interface PbWellnessRow {
  id: string;
  date?: string | null;
  ctl?: number | null;
  atl?: number | null;
  resting_hr?: number | null;
  hrv?: number | null;
  sleep_secs?: number | null;
  data?: Json;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

export function toEvent(r: PbEventRow): EventEx {
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    id: num(r.intervals_id ?? d.id),
    uid: str(r.uid),
    start_date_local: String(r.start_date_local ?? d.start_date_local ?? ''),
    end_date_local: str(r.end_date_local ?? d.end_date_local),
    category: (str(r.category ?? d.category) ?? 'WORKOUT') as EventCategory,
    type: str(r.type ?? d.type) as EventEx['type'],
    name: str(r.name ?? d.name),
    description: str(r.description ?? d.description),
    distance: num(r.distance ?? d.distance),
    moving_time: num(r.moving_time ?? d.moving_time),
    icu_training_load: num(r.icu_training_load ?? d.icu_training_load),
    icu_intensity: num(r.icu_intensity ?? d.icu_intensity),
    paired_activity_id: num(r.paired_activity_id ?? d.paired_activity_id),
    workout_doc: (r.workout_doc ?? d.workout_doc ?? undefined) as WorkoutDoc | undefined,
  };
}

export function toActivity(r: PbActivityRow): Activity {
  const d = (r.data ?? {}) as Record<string, unknown>;
  return {
    id: String(r.intervals_id ?? d.id ?? r.id),
    name: str(r.name ?? d.name),
    start_date_local: String(r.start_date_local ?? d.start_date_local ?? ''),
    type: str(r.type ?? d.type) as Activity['type'],
    race: r.race ?? d.race === true,
    distance: num(r.distance ?? d.distance),
    moving_time: num(r.moving_time ?? d.moving_time),
    average_heartrate: num(r.average_heartrate ?? d.average_heartrate) ?? null,
    pace: num(r.pace ?? d.pace) ?? null,
    icu_training_load: num(r.icu_training_load ?? d.icu_training_load) ?? null,
    icu_intensity: num(r.icu_intensity ?? d.icu_intensity) ?? null,
    icu_ctl: num(r.icu_ctl ?? d.icu_ctl) ?? null,
    icu_atl: num(r.icu_atl ?? d.icu_atl) ?? null,
    icu_zone_times: (r.zone_times ?? d.icu_zone_times ?? undefined) as ZoneTime[] | undefined,
    paired_event_id: num(r.paired_event_id ?? d.paired_event_id),
    source: str(r.source ?? d.source),
  };
}

export function toWellness(r: PbWellnessRow): WellnessDay {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const f = (v: unknown): number | null | undefined =>
    typeof v === 'number' ? v : v == null ? null : undefined;
  return {
    id: String(r.date ?? d.date ?? r.id),
    ctl: f(r.ctl ?? d.ctl) ?? null,
    atl: f(r.atl ?? d.atl) ?? null,
    restingHR: f(r.resting_hr ?? d.restingHR) ?? null,
    hrv: f(r.hrv ?? d.hrv) ?? null,
    sleepSecs: f(r.sleep_secs ?? d.sleepSecs) ?? null,
  };
}

/** The users auth record fields the app reads/writes (secrets are write-only). */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  intervalsAthleteId: string;
  preferredModel: string;
  units: 'km' | 'mi';
  athleteProfile: string;
  /** Round 23: first-run onboarding gate (non-hidden PB bool). */
  onboarded: boolean;
  /** Round 23: optional OpenAI-compatible chat base for the DIRECT path. */
  llmBaseUrl: string;
  /** PB record `updated` timestamp — when ANY of this record's fields last changed. */
  updated: string | null;
}

type PbUserRecord = Record<string, unknown>;

export function toAppUser(record: PbUserRecord): AppUser {
  return {
    id: String(record.id ?? ''),
    name: str(record.name) ?? '',
    email: str(record.email) ?? '',
    intervalsAthleteId: str(record.intervals_athlete_id) ?? '',
    preferredModel: str(record.preferred_model) ?? '',
    units: record.units === 'mi' ? 'mi' : 'km',
    athleteProfile: str(record.athlete_profile) ?? '',
    onboarded: record.onboarded === true,
    llmBaseUrl: str(record.llm_base_url) ?? '',
    updated: str(record.updated) ?? null,
  };
}

// ---------- proposals (worker-shaped) ----------

export type ProposalKind = 'create_event' | 'update_event' | 'delete_event';

export interface Proposal {
  id: string;
  kind: ProposalKind;
  payload: EventEx;
  rationale: string | null;
  status?: string;
  /** PB `created` stamp — oldest-first ordering for grouped review. */
  created?: string | null;
  /**
   * Bundle grouping (proposal-approval v2 §2): set when the coach proposed
   * this change as part of one holistic reason. 2+ pending rows sharing
   * `bundleKey` review together in the bundle sheet.
   */
  bundleKey?: string | null;
  bundleSummary?: string | null;
}
