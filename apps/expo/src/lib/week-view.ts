/**
 * Pure view-model builders for the week view v2 (design spec
 * docs/design/calendar-week-v2-spec.md): day-strip pills, day-card rollup
 * chips, and run-card models (status chip + labeled metric grid + zone
 * accent edge). All number formatting + text assembly lives here so it is
 * unit-testable; components only render.
 *
 * Spec rules: no dot-separated metric lines anywhere in the week view;
 * estimates keep their ≈ mark; load is never fabricated; missing metrics are
 * omitted, never dashed.
 */
import {
  formatDuration,
  formatKm,
  formatPace,
  isRaceEvent,
  reconcileDay,
  type Activity,
  type DayCell,
  type EventEx,
} from '@intervals/core';
import { WEEKDAY_SHORT, timeLabel, weekdayIndex } from './dates';
import { zoneSecondsOf } from './format';

// ---------------------------------------------------------------------------
// Day pills (spec §1)
// ---------------------------------------------------------------------------

export interface DayPillModel {
  date: string;
  /** Weekday letter ("M".."S"). */
  letter: string;
  /** Day-of-month ("07"). */
  dayNum: string;
  recorded: boolean;
  planned: boolean;
  race: boolean;
  isToday: boolean;
}

/** Markers for the seven day pills: recorded ✓ / planned / race / today. */
export function dayPills(
  dates: string[],
  cellOf: (date: string) => DayCell | undefined,
  today: string,
): DayPillModel[] {
  return dates.map((date) => {
    const cell = cellOf(date);
    return {
      date,
      letter: WEEKDAY_SHORT[weekdayIndex(date)]!.slice(0, 1),
      dayNum: date.slice(8, 10),
      recorded: (cell?.activities.length ?? 0) > 0,
      planned: (cell?.events.length ?? 0) > 0,
      race: cell?.events.some(isRaceEvent) ?? false,
      isToday: date === today,
    };
  });
}

// ---------------------------------------------------------------------------
// Status + zone accent (spec §2 RunCard)
// ---------------------------------------------------------------------------

export type RunStatus = 'done' | 'planned' | 'missed' | 'race';

/**
 * DONE ✓ (recorded) / PLANNED / MISSED (past planned, never recorded) /
 * RACE — race wins over everything, missed needs `today`.
 */
export function runStatus(e: EventEx | null, a: Activity | null, today: string): RunStatus {
  if ((a?.race ?? false) === true || isRaceEvent(e ?? undefined)) return 'race';
  if (a) return 'done';
  if (e && e.start_date_local.slice(0, 10) < today) return 'missed';
  return 'planned';
}

/**
 * Dominant zone of a recorded session: the zone with the most seconds; ties
 * break toward the cooler zone. Null when no zone data exists (the accent
 * edge then falls back to muted).
 */
export function dominantZone(zoneSeconds: Record<string, number>): string | null {
  let best: { id: string; secs: number; n: number } | null = null;
  for (const [id, secs] of Object.entries(zoneSeconds)) {
    if (!(secs > 0)) continue;
    const n = Number(/^Z([1-7])$/i.exec(id.trim())?.[1] ?? 9);
    if (!best || secs > best.secs || (secs === best.secs && n < best.n)) {
      best = { id, secs, n };
    }
  }
  return best?.id ?? null;
}

const TAG_RULES: Array<[RegExp, string]> = [
  [/interval|repeat|reps?\b|\d\s*[x×]\s*\d|track|strides?/i, 'Intervals'],
  [/tempo|threshold|progression/i, 'Tempo'],
  [/\blong\b/i, 'Long'],
  [/recovery|easy|shake/i, 'Easy'],
];

/** Type tag from the session name — only when confident, else null. */
export function typeTagOf(name: string | null | undefined): string | null {
  if (!name) return null;
  for (const [re, tag] of TAG_RULES) {
    if (re.test(name)) return tag;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Metric grid (spec §2: DISTANCE · TIME · PACE · HR · LOAD, labeled values)
// ---------------------------------------------------------------------------

export interface MetricCell {
  id: string;
  label: string;
  value: string;
  /** True when the value was pace-estimated (renders with a ≈ mark). */
  estimated?: boolean;
}

export interface Estimable {
  value: number;
  estimated: boolean;
}

/**
 * A planned session's distance + time, the missing half estimated from the
 * athlete's pace (same convention as core weeklyStats — flagged for ≈).
 */
export function plannedDistanceTime(
  e: EventEx,
  paceMinPerKm: number | null,
): { distanceM: Estimable | null; timeSec: Estimable | null } {
  const pace = typeof paceMinPerKm === 'number' && paceMinPerKm > 0 ? paceMinPerKm : null;
  let distanceM: Estimable | null = (e.distance ?? 0) > 0 ? { value: e.distance!, estimated: false } : null;
  let timeSec: Estimable | null = (e.moving_time ?? 0) > 0 ? { value: e.moving_time!, estimated: false } : null;
  if (pace) {
    if (!distanceM && timeSec) {
      distanceM = { value: (timeSec.value / 60 / pace) * 1000, estimated: true };
    }
    if (!timeSec && distanceM) {
      timeSec = { value: (distanceM.value / 1000) * pace * 60, estimated: true };
    }
  }
  return { distanceM, timeSec };
}

const cell = (id: string, label: string, value: string | null, estimated?: boolean): MetricCell | null =>
  value ? { id, label, value, estimated } : null;

/** Actuals for a recorded session — missing metrics are omitted, never dashed. */
export function recordedMetricCells(a: Activity): MetricCell[] {
  const load = a.icu_training_load ?? 0;
  return [
    cell('distance', 'Distance', (a.distance ?? 0) > 0 ? formatKm(a.distance!) : null),
    cell('time', 'Time', (a.moving_time ?? 0) > 0 ? formatDuration(a.moving_time!) : null),
    cell('pace', 'Pace', typeof a.pace === 'number' && a.pace > 0 ? formatPace(a.pace) : null),
    cell('hr', 'HR', a.average_heartrate ? `${Math.round(a.average_heartrate)}` : null),
    cell('load', 'Load', load > 0 ? `${Math.round(load)}` : null),
  ].filter((m): m is MetricCell => m !== null);
}

/** Planned targets for an unrecorded session (estimates keep ≈). */
export function plannedMetricCells(e: EventEx, paceMinPerKm: number | null): MetricCell[] {
  const { distanceM, timeSec } = plannedDistanceTime(e, paceMinPerKm);
  const load = e.icu_training_load ?? 0;
  return [
    cell('distance', 'Distance', distanceM ? formatKm(distanceM.value) : null, distanceM?.estimated),
    cell('time', 'Time', timeSec ? formatDuration(timeSec.value) : null, timeSec?.estimated),
    cell('load', 'Load', load > 0 ? `${Math.round(load)}` : null),
  ].filter((m): m is MetricCell => m !== null);
}

// ---------------------------------------------------------------------------
// Run cards (spec §2)
// ---------------------------------------------------------------------------

export interface RunCardModel {
  key: string;
  title: string;
  status: RunStatus;
  /** "06:15" start time when the entry declares one. */
  start: string | null;
  /** Type tag (Tempo/Easy/…) when confident, else null. */
  tag: string | null;
  metrics: MetricCell[];
  /** Dominant zone id ("Z3") of the recorded session; null without data. */
  zone: string | null;
}

/** Model for one RunCard: a planned event merged with its recorded actual, or a lone activity. */
export function runCardModel(
  e: EventEx | null,
  a: Activity | null,
  opts: { today: string; paceMinPerKm?: number | null },
): RunCardModel {
  const status = runStatus(e, a, opts.today);
  const title = a?.name ?? e?.name ?? (e ? 'Planned workout' : 'Activity');
  const metrics =
    a != null ? recordedMetricCells(a) : plannedMetricCells(e!, opts.paceMinPerKm ?? null);
  return {
    key: a?.id ?? `e${e?.id ?? e?.uid ?? e?.start_date_local ?? 'x'}`,
    title,
    status,
    start: timeLabel((a ?? e)!.start_date_local) || null,
    tag: typeTagOf(a?.name ?? e?.name),
    metrics,
    zone: a ? dominantZone(zoneSecondsOf(a)) : null,
  };
}

/** Run-card models for a whole day: reconciled events first, then lone activities. */
export function dayRunModels(
  c: DayCell,
  opts: { today: string; paceMinPerKm?: number | null },
): RunCardModel[] {
  const { events, lone } = reconcileDay(c);
  return [
    ...events.map(({ event, actual }) => runCardModel(event, actual, opts)),
    ...lone.map((a) => runCardModel(null, a, opts)),
  ];
}

// ---------------------------------------------------------------------------
// Day rollup chips (spec §2 header: "2 runs · 10.5km · load 108")
// ---------------------------------------------------------------------------

export interface DayRollup {
  rest: boolean;
  /** Sessions on the day (events + lone activities; a recorded event counts once). */
  count: number;
  distanceM: number;
  timeSec: number;
  load: number;
  /** True when any contributing distance/time was pace-estimated (≈). */
  distanceEstimated: boolean;
  timeEstimated: boolean;
}

/**
 * Day aggregate for the DayCard header. Recorded sessions contribute
 * actuals; unrecorded ones contribute planned targets (pace-estimated when
 * half-declared). Load: actual load when recorded, else planned load — never
 * both, never fabricated.
 */
export function dayRollup(
  c: DayCell,
  opts: { paceMinPerKm?: number | null } = {},
): DayRollup {
  const out: DayRollup = {
    rest: false,
    count: 0,
    distanceM: 0,
    timeSec: 0,
    load: 0,
    distanceEstimated: false,
    timeEstimated: false,
  };
  // Reconciled view (QA A2): a same-day unpaired activity completes its
  // planned event, so the session contributes ONCE — actuals when recorded,
  // planned targets when not. Never planned+actual summed together.
  const { events, lone } = reconcileDay(c);
  for (const { event: e, actual } of events) {
    out.count += 1;
    if (actual) {
      out.distanceM += actual.distance ?? 0;
      out.timeSec += actual.moving_time ?? 0;
      out.load += actual.icu_training_load ?? 0;
    } else {
      const planned = plannedDistanceTime(e, opts.paceMinPerKm ?? null);
      if (planned.distanceM) {
        out.distanceM += planned.distanceM.value;
        out.distanceEstimated = out.distanceEstimated || planned.distanceM.estimated;
      }
      if (planned.timeSec) {
        out.timeSec += planned.timeSec.value;
        out.timeEstimated = out.timeEstimated || planned.timeSec.estimated;
      }
      out.load += e.icu_training_load ?? 0;
    }
  }
  for (const a of lone) {
    out.count += 1;
    out.distanceM += a.distance ?? 0;
    out.timeSec += a.moving_time ?? 0;
    out.load += a.icu_training_load ?? 0;
  }
  out.rest = out.count === 0;
  return out;
}

export interface RollupChip {
  id: 'count' | 'distance' | 'time' | 'load';
  text: string;
  estimated?: boolean;
}

/** Header chips: "2 runs" · "≈10.5km" · "load 108". Time only when there is no distance to show. */
export function rollupChips(r: DayRollup): RollupChip[] {
  const chips: RollupChip[] = [];
  if (r.count > 0) {
    chips.push({ id: 'count', text: `${r.count} run${r.count > 1 ? 's' : ''}` });
  }
  if (r.distanceM > 0) {
    chips.push({ id: 'distance', text: formatKm(r.distanceM), estimated: r.distanceEstimated });
  } else if (r.timeSec > 0) {
    chips.push({ id: 'time', text: formatDuration(r.timeSec), estimated: r.timeEstimated });
  }
  if (r.load > 0) {
    chips.push({ id: 'load', text: `load ${Math.round(r.load)}` });
  }
  return chips;
}

// ---------------------------------------------------------------------------
// Mobile compact models (calendar-week-mobile-spec v2.1: flat rows, <900px)
// ---------------------------------------------------------------------------

/**
 * One-line muted rollup for the compact day header: "10.5km · 108" —
 * distance (or time when no distance is knowable) then load, load only
 * when > 0. Estimates keep ≈. The run count is dropped: the rows below
 * already show it (spec §1: chips shrink to text-only).
 */
export function compactRollupText(r: DayRollup): string | null {
  const parts: string[] = [];
  if (r.distanceM > 0) {
    parts.push(`${r.distanceEstimated ? '≈' : ''}${formatKm(r.distanceM)}`);
  } else if (r.timeSec > 0) {
    parts.push(`${r.timeEstimated ? '≈' : ''}${formatDuration(r.timeSec)}`);
  }
  if (r.load > 0) {
    parts.push(`${Math.round(r.load)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Line-2 stat cells for the compact run row: distance · time · load only
 * (spec §2 — pace/HR stay in the detail sheet; never a labeled grid here).
 */
export function compactStatCells(metrics: MetricCell[]): MetricCell[] {
  const keep = new Set(['distance', 'time', 'load']);
  return metrics.filter((m) => keep.has(m.id));
}
