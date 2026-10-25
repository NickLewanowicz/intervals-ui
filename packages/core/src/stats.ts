/**
 * Pure calendar + stats math. No I/O — everything here is unit-tested and
 * mutation-guarded (docs/TESTING.md pattern from the practice project).
 *
 * Calendar projection rules (docs/SPEC.md):
 * - A day shows the planned Event and/or recorded Activity.
 * - An activity with paired_event_id renders merged onto its event.
 * - form/TSB is NOT provided by intervals.icu — computed here: form = ctl − atl.
 */
import type { Activity, EventEx, WellnessDay, ZoneTime } from './types';
import { RACE_CATEGORIES } from './types';

export function eventDate(e: EventEx): string {
  return e.start_date_local.slice(0, 10);
}

export function activityDate(a: Activity): string {
  return a.start_date_local.slice(0, 10);
}

export function isRaceEvent(e: EventEx | undefined): boolean {
  return !!e && (RACE_CATEGORIES as readonly string[]).includes(e.category ?? '');
}

export interface DayCell {
  date: string;
  events: EventEx[];
  activities: Activity[];
  /** activity.id → paired event id map is implicit in the objects themselves */
}

/** Group events + activities by athlete-local calendar date. */
export function buildDayCells(
  events: EventEx[],
  activities: Activity[],
): Map<string, DayCell> {
  const cells = new Map<string, DayCell>();
  const cell = (date: string) => {
    let c = cells.get(date);
    if (!c) {
      c = { date, events: [], activities: [] };
      cells.set(date, c);
    }
    return c;
  };
  for (const e of events) cell(eventDate(e)).events.push(e);
  for (const a of activities) cell(activityDate(a)).activities.push(a);
  return cells;
}

/** Monday-start week key (YYYY-MM-DD of the week's Monday). */
export function weekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d!));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

export interface WeeklyStats {
  weekOf: string; // Monday
  plannedDistanceM: number;
  plannedTimeSec: number;
  plannedLoad: number;
  actualDistanceM: number;
  actualTimeSec: number;
  actualLoad: number;
  runs: number;
  races: number;
  /** Primary zone (Z1..Z7) seconds actually run, summed over recorded runs. */
  zoneSeconds: Record<string, number>;
  /** Longest actual run distance in the week, meters. */
  longestRunM: number;
  /** True when any planned distance came from time × pace (planned events often
   *  carry moving_time but no distance — intervals.icu only fills what the plan
   *  declared). UI marks such totals with "≈". */
  plannedDistanceEstimated?: boolean;
  /** Same flag for planned time estimated from distance × pace. */
  plannedTimeEstimated?: boolean;
}

const sum = (xs: Array<number | undefined | null>) =>
  xs.reduce<number>((acc, x) => acc + (typeof x === 'number' ? x : 0), 0);

/** Options for weeklyStats — new optional params stay backward-compatible. */
export interface WeeklyStatsOpts {
  /**
   * Athlete's recent average pace in min/km (or threshold pace as fallback).
   * When set, planned events missing distance get distance = time ÷ pace, and
   * events missing moving_time get time = distance × pace. Estimated parts are
   * flagged via plannedDistanceEstimated / plannedTimeEstimated — load is never
   * fabricated (intervals.icu computes planned load properly).
   */
  paceMinPerKm?: number | null;
}

/**
 * Recent actual average pace (min/km) over an activity window — the estimator
 * input for weeklyStats. Run-family activities are preferred when any qualify
 * (a mixed run/ride window would otherwise dilute the pace); falls back to all
 * activities with both time and distance. Null when nothing qualifies.
 */
const RUN_SPORTS = new Set(['Run', 'TrailRun', 'VirtualRun', 'Treadmill']);
export function averagePaceMinPerKm(activities: Activity[]): number | null {
  const eligible = (a: Activity) =>
    typeof a.moving_time === 'number' && a.moving_time > 0 && typeof a.distance === 'number' && a.distance > 0;
  const paceOf = (list: Activity[]): number | null => {
    let secs = 0;
    let meters = 0;
    for (const a of list) {
      secs += a.moving_time!;
      meters += a.distance!;
    }
    if (meters <= 0 || secs <= 0) return null;
    return secs / 60 / (meters / 1000);
  };
  const runs = activities.filter((a) => eligible(a) && RUN_SPORTS.has(a.type ?? ''));
  if (runs.length > 0) return paceOf(runs);
  return paceOf(activities.filter(eligible));
}

export function weeklyStats(
  events: EventEx[],
  activities: Activity[],
  week: string,
  opts: WeeklyStatsOpts = {},
): WeeklyStats {
  const planned = events.filter((e) => weekKey(eventDate(e)) === week);
  const actual = activities.filter((a) => weekKey(activityDate(a)) === week);
  const zoneSeconds: Record<string, number> = {};
  for (const a of actual) {
    for (const zt of a.icu_zone_times ?? []) {
      zoneSeconds[zt.id] = (zoneSeconds[zt.id] ?? 0) + zt.secs;
    }
  }
  // Per-event planned sums with pace-based estimation for half-declared events.
  const pace =
    typeof opts.paceMinPerKm === 'number' && opts.paceMinPerKm > 0 ? opts.paceMinPerKm : null;
  let plannedDistanceM = 0;
  let plannedTimeSec = 0;
  let plannedDistanceEstimated = false;
  let plannedTimeEstimated = false;
  for (const e of planned) {
    const hasDist = typeof e.distance === 'number' && e.distance > 0;
    const hasTime = typeof e.moving_time === 'number' && e.moving_time > 0;
    if (hasDist) plannedDistanceM += e.distance!;
    else if (hasTime && pace) {
      plannedDistanceM += (e.moving_time! / 60 / pace) * 1000;
      plannedDistanceEstimated = true;
    }
    if (hasTime) plannedTimeSec += e.moving_time!;
    else if (hasDist && pace) {
      plannedTimeSec += (e.distance! / 1000) * pace * 60;
      plannedTimeEstimated = true;
    }
  }
  return {
    weekOf: week,
    plannedDistanceM,
    plannedTimeSec,
    plannedLoad: sum(planned.map((e) => e.icu_training_load)),
    actualDistanceM: sum(actual.map((a) => a.distance)),
    actualTimeSec: sum(actual.map((a) => a.moving_time)),
    actualLoad: sum(actual.map((a) => a.icu_training_load)),
    runs: actual.length,
    races: actual.filter((a) => a.race).length,
    zoneSeconds,
    longestRunM: actual.reduce((mx, a) => Math.max(mx, a.distance ?? 0), 0),
    plannedDistanceEstimated: plannedDistanceEstimated || undefined,
    plannedTimeEstimated: plannedTimeEstimated || undefined,
  };
}

/** form = ctl − atl (intervals.icu convention; fresh > 0, fatigued < 0). */
export function form(w: WellnessDay | undefined): number | null {
  if (!w || w.ctl == null || w.atl == null) return null;
  return w.ctl - w.atl;
}

/** Compact one-line zone summary, e.g. "Z2 3h10m · Z3 45m · Z4 12m". */
export function formatZoneSeconds(zoneSeconds: Record<string, number>): string {
  const parts = Object.entries(zoneSeconds)
    .filter(([, secs]) => secs >= 60)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([id, secs]) => `${id} ${formatDuration(secs)}`);
  return parts.join(' · ');
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = h > 0 ? Math.floor((s % 3600) / 60) : Math.max(1, Math.floor(s / 60));
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

export function formatKm(meters: number): string {
  return (meters / 1000).toFixed(1) + 'km';
}

/** Human pace from min/km float, e.g. 3.70 → "3:42/km". */
export function formatPace(minPerKm: number): string {
  const m = Math.floor(minPerKm);
  const s = Math.round((minPerKm - m) * 60);
  return `${m}:${String(s === 60 ? 0 : s).padStart(2, '0')}/km`;
}

/** Wellness trend over N days for coach context (compact). */
export function wellnessSummary(days: WellnessDay[]): {
  avgForm: number | null;
  avgHrv: number | null;
  avgRestingHr: number | null;
  avgSleepHrs: number | null;
} {
  const avg = (xs: Array<number | null | undefined>) => {
    const vals = xs.filter((x): x is number => typeof x === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  return {
    avgForm: avg(days.map((d) => form(d))),
    avgHrv: avg(days.map((d) => d.hrv)),
    avgRestingHr: avg(days.map((d) => d.restingHR)),
    avgSleepHrs: avg(days.map((d) => (d.sleepSecs ? d.sleepSecs / 3600 : null))),
  };
}
