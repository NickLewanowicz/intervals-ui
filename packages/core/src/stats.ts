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

// ---------------------------------------------------------------------------
// Gap / load-needed math (docs/research/athlete-dashboard-metrics.md §2)
//
// Coggan-style exponentially weighted states with intervals.icu defaults
// CTL 42d / ATL 7d. Each day: CTL += (L − CTL)/42, ATL += (L − ATL)/7.
// The closed forms below are exact for CONSTANT daily load over the horizon —
// which is exactly what the dashboard card quotes. Day-by-day `project` is
// canonical for varying loads. All pure; no I/O. Fixtures in tests/stats.test.ts
// come from the spec's §2.7 acceptance examples.
// ---------------------------------------------------------------------------

/** One-day exponential update (spec §2.1), exported for tests/tools. */
export function stepState(ctl: number, atl: number, load: number): { ctl: number; atl: number } {
  return { ctl: ctl + (load - ctl) / 42, atl: atl + (load - atl) / 7 };
}

/** Day-by-day projection over varying daily loads — exact for any pattern. */
export function project(
  ctl0: number,
  atl0: number,
  loads: number[],
): { ctl: number; atl: number; form: number } {
  let c = ctl0;
  let a = atl0;
  for (const L of loads) {
    const next = stepState(c, a, L);
    c = next.ctl;
    a = next.atl;
  }
  return { ctl: c, atl: a, form: c - a };
}

/**
 * Constant daily load over `days` that lands on `targetForm` (spec §2.2).
 * Powers come from the exact rationals 41/42 and 6/7 — never hardcoded.
 */
export function requiredDailyLoad(
  ctl0: number,
  atl0: number,
  days: number,
  targetForm: number,
): number {
  const ak = Math.pow(41 / 42, days);
  const bk = Math.pow(6 / 7, days);
  const cC = (1 - ak) / (ak - bk);
  const cT = 1 / (ak - bk);
  return (1 + cC) * atl0 - cC * ctl0 + cT * (ctl0 - atl0 - targetForm);
}

/** Daily load that holds form exactly flat over the horizon (spec §2.3). */
export function holdFlatDailyLoad(ctl0: number, atl0: number, days = 7): number {
  return requiredDailyLoad(ctl0, atl0, days, ctl0 - atl0);
}

/** Daily load that brings form to zero over the horizon (spec §2.4). */
export function formZeroDailyLoad(ctl0: number, atl0: number, days = 7): number {
  return requiredDailyLoad(ctl0, atl0, days, 0);
}

/** Weekly load (default 7d) that holds form flat — the card's "hold-flat". */
export function loadToHoldFlat(ctl0: number, atl0: number, horizonDays = 7): number {
  return horizonDays * holdFlatDailyLoad(ctl0, atl0, horizonDays);
}

/** Weekly load (default 7d) that reaches neutral form — the "to-zero" number. */
export function loadToFormZero(ctl0: number, atl0: number, horizonDays = 7): number {
  return horizonDays * formZeroDailyLoad(ctl0, atl0, horizonDays);
}

/** Weekly load that holds CTL exactly flat (constant L = C0 keeps CTL put). */
export function ctlFlatWeeklyLoad(ctl0: number, days = 7): number {
  return days * ctl0;
}

/**
 * CTL drift per week at constant daily load `dailyLoad` (spec §2.5):
 * ΔCTL = (1 − a^k)·(L̄ − C0). First-week rate — never extrapolate linearly.
 */
export function ctlDriftPerWeek(dailyLoad: number, ctl0: number, days = 7): number {
  const ak = Math.pow(41 / 42, days);
  return (1 - ak) * (dailyLoad - ctl0);
}

/** Planned training load per day for the Mon-start week `monday` (index 0 = Mon). */
export function dailyPlannedLoads(events: EventEx[], monday: string): number[] {
  const loads = [0, 0, 0, 0, 0, 0, 0];
  const [y, m, d] = monday.split('-').map(Number);
  const monMs = Date.UTC(y!, (m ?? 1) - 1, d!);
  for (const e of events) {
    const [ey, em, ed] = eventDate(e).split('-').map(Number);
    if (ey == null || em == null || ed == null) continue;
    const idx = Math.round((Date.UTC(ey, em - 1, ed) - monMs) / 86_400_000);
    if (idx >= 0 && idx < 7) loads[idx]! += e.icu_training_load ?? 0;
  }
  return loads;
}

// ---------------------------------------------------------------------------
// Zone balance (spec §1.2): LOW = Z1+Z2 · MODERATE = Z3+SS · HIGH = Z4–Z7.
// Thresholds are the 80/20 population optimum from the knowledge base.
// ---------------------------------------------------------------------------

export type ZoneFlag = 'healthy' | 'amber' | 'red';

export interface ZoneBalance {
  lowPct: number;
  modPct: number;
  highPct: number;
  totalSecs: number;
  lowFlag: ZoneFlag; // ≥75 healthy · 60–74 amber · <60 red
  modFlag: ZoneFlag; // ≤10 healthy · 10–20 amber · >20 red
  highFlag: ZoneFlag; // ≤25 healthy · >25 red
  /** LOW < 60% in a non-race week — the moderate-trap warning. */
  moderateTrap: boolean;
}

/** Weekly time-in-zone rollup → LOW/MOD/HIGH shares + spec §1.2 flags. */
export function zoneBalance(
  zoneSeconds: Record<string, number>,
  opts: { raceWeek?: boolean } = {},
): ZoneBalance {
  let low = 0;
  let mod = 0;
  let high = 0;
  for (const [id, secs] of Object.entries(zoneSeconds)) {
    const z = id.trim().toUpperCase();
    if (z === 'Z1' || z === 'Z2') low += secs;
    else if (z === 'Z3' || z === 'SS') mod += secs;
    else if (/^Z[4-7]$/.test(z)) high += secs;
  }
  const total = low + mod + high;
  const pct = (x: number) => (total > 0 ? Math.round((x / total) * 100) : 0);
  const lowPct = pct(low);
  const modPct = pct(mod);
  const highPct = pct(high);
  return {
    lowPct,
    modPct,
    highPct,
    totalSecs: total,
    lowFlag: lowPct >= 75 ? 'healthy' : lowPct >= 60 ? 'amber' : 'red',
    modFlag: modFlagFor(modPct),
    highFlag: highPct > 25 ? 'red' : 'healthy',
    moderateTrap: total > 0 && lowPct < 60 && !opts.raceWeek,
  };
}

function modFlagFor(modPct: number): ZoneFlag {
  if (modPct > 20) return 'red';
  if (modPct > 10) return 'amber';
  return 'healthy';
}

export interface FenceRider {
  id: string;
  name?: string;
  /** % of the run's zone time spent in Z3+SS, integer. */
  z3Pct: number;
}

/**
 * Fence-rider flags (spec §1.2): any run with >10% of its zone time in
 * Z3+SS — intensity blindness made concrete. Sorted worst first.
 */
export function fenceRiders(activities: Activity[]): FenceRider[] {
  const out: FenceRider[] = [];
  for (const a of activities) {
    const zt = a.icu_zone_times ?? [];
    const total = zt.reduce((s, z) => s + z.secs, 0);
    if (total <= 0) continue;
    const mod = zt
      .filter((z) => z.id.trim().toUpperCase() === 'Z3' || z.id.trim().toUpperCase() === 'SS')
      .reduce((s, z) => s + z.secs, 0);
    const pct = mod / total;
    if (pct > 0.1) out.push({ id: a.id, name: a.name, z3Pct: Math.round(pct * 100) });
  }
  return out.sort((x, y) => y.z3Pct - x.z3Pct);
}

// ---------------------------------------------------------------------------
// Fitness/fatigue trend + form bands (spec §1.3/§1.4). days = newest-first
// wellness rows (the app's `-date` sort); trend = today − 7 rows ago.
// ---------------------------------------------------------------------------

export type FormBand = 'very-fresh' | 'fresh' | 'neutral' | 'fatigued' | 'deeply-fatigued';

/** Coggan TSB heuristic bands (spec §1.4 — guidance, not physics). */
export function formBand(f: number): FormBand {
  if (f >= 25) return 'very-fresh';
  if (f >= 5) return 'fresh';
  if (f >= -10) return 'neutral';
  if (f >= -30) return 'fatigued';
  return 'deeply-fatigued';
}

/** Card wording per band. */
export const FORM_BAND_WORD: Record<FormBand, string> = {
  'very-fresh': 'very fresh',
  fresh: 'fresh',
  neutral: 'neutral',
  fatigued: 'fatigued',
  'deeply-fatigued': 'deeply fatigued',
};

export interface FitnessTrend {
  date: string;
  ctl: number;
  atl: number;
  form: number;
  /** ctl(today) − ctl(7 rows ago); null when the mirror is < 8 days deep. */
  ctlDelta7: number | null;
  atlDelta7: number | null;
  formDelta7: number | null;
  band: FormBand;
  /** Fitness falling while form positive = detraining, not recovery (§1.3). */
  detraining: boolean;
}

/** Newest-first wellness rows → the "where I'm at" state read. Null without a usable latest row. */
export function fitnessTrend(days: WellnessDay[]): FitnessTrend | null {
  const today = days[0];
  if (!today || today.ctl == null || today.atl == null) return null;
  const weekAgo = days[7];
  const d = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null ? null : a - b;
  const ctlDelta7 = d(today.ctl, weekAgo?.ctl);
  const atlDelta7 = d(today.atl, weekAgo?.atl);
  const form = today.ctl - today.atl;
  const formDelta7 =
    ctlDelta7 != null && atlDelta7 != null ? ctlDelta7 - atlDelta7 : null;
  return {
    date: today.id,
    ctl: today.ctl,
    atl: today.atl,
    form,
    ctlDelta7,
    atlDelta7,
    formDelta7,
    band: formBand(form),
    detraining: ctlDelta7 != null && ctlDelta7 <= -1 && form > 0,
  };
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
