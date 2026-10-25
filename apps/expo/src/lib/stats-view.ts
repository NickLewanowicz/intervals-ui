/**
 * Pure view-model builders for the calendar stats card (metrics spec
 * docs/research/athlete-dashboard-metrics.md §3: PRIMARY state + verdict
 * always visible, SECONDARY details behind a disclosure). All number
 * formatting + text assembly lives here so it is unit-testable; components
 * only render.
 *
 * Spec §0 conventions: load integers · distance 1dp · CTL/ATL 1dp ·
 * form/drift/percentages integers · projections marked (est) · load is never
 * fabricated.
 */
import {
  fitnessTrend,
  loadToHoldFlat,
  project,
  weekKey,
  type EventEx,
  type Activity,
  type FitnessTrend,
  type WellnessDay,
} from '@intervals/core';

/** "-3" / "+1" / "0" — signed integer with explicit sign, never "-0". */
export function signedInt(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `${r}`;
}

/** 1dp formatting for CTL/ATL ("41.9"). */
export function fmt1dp(n: number): string {
  return n.toFixed(1);
}

/** Trend arrow glyph: ▲ up, ▼ down, → flat/unknown. */
export function trendArrow(delta: number | null, flatBand = 0.05): string {
  if (delta == null || Math.abs(delta) < flatBand) return '→';
  return delta > 0 ? '▲' : '▼';
}

/** One-line headline verdict from the spec §3 templates (state · load). */
export function buildVerdict(trend: FitnessTrend | null, plannedWeekLoad: number): string | null {
  if (!trend) return null;
  const state = trend.detraining && trend.ctlDelta7 != null
    ? `fresher, but fitness ${signedInt(trend.ctlDelta7)}/wk — detraining, not a taper (est)`
    : `Form ${Math.round(trend.form)}, ${trendWord(trend.formDelta7)}`;
  const load =
    plannedWeekLoad > 0
      ? `hold-flat ≈ ${Math.round(loadToHoldFlat(trend.ctl, trend.atl))}/wk, you're at ${Math.round(plannedWeekLoad)}`
      : null;
  return load ? `${state} · ${load}` : state;
}

function trendWord(formDelta7: number | null): string {
  if (formDelta7 == null || Math.abs(formDelta7) < 1) return 'steady';
  return formDelta7 < 0 ? 'trending down' : 'trending up';
}

export interface GapModel {
  /** Weekly hold-flat load (spec §2.3), rounded for display. */
  holdWeekly: number;
  holdDaily: number;
  /** The week's planned load; 0 when nothing is planned. */
  plannedWeekly: number;
  /** hold − planned; positive = under-cooked vs flat form. */
  gapWeekly: number;
  ctl0: number;
  form0: number;
  /** Where the remaining week's loads land (spec §2.6 project). */
  endCtl: number;
  endForm: number;
  /** False when the week is already over (nothing left to project). */
  projected: boolean;
}

/**
 * The gap card model: hold-flat vs the week's loads, plus the projected
 * end-of-week state. `futureLoads` = planned loads for the days AFTER today
 * through Sunday (the latest wellness row already includes today's load).
 */
export function gapModel(
  trend: FitnessTrend,
  futureLoads: number[],
  plannedWeekly: number,
): GapModel {
  const p = project(trend.ctl, trend.atl, futureLoads);
  const holdWeekly = Math.round(loadToHoldFlat(trend.ctl, trend.atl));
  return {
    holdWeekly,
    holdDaily: Math.round(loadToHoldFlat(trend.ctl, trend.atl) / 7),
    plannedWeekly: Math.round(plannedWeekly),
    gapWeekly: holdWeekly - Math.round(plannedWeekly),
    ctl0: trend.ctl,
    form0: trend.form,
    endCtl: p.ctl,
    endForm: p.form,
    projected: futureLoads.length > 0,
  };
}

/** One line for the details gap card, e.g. "Hold-flat ≈ 307/wk (44/day) · planned 266 → 41 under · CTL 41.9 → 41.4, form −2 → −1 by Sun (est)". */
export function gapLine(g: GapModel, horizonLabel: string): string {
  const parts: string[] = [`Hold-flat ≈ ${g.holdWeekly}/wk (${g.holdDaily}/day)`];
  if (g.plannedWeekly > 0) {
    const rel = g.gapWeekly >= 0 ? `${g.gapWeekly} under` : `${-g.gapWeekly} over`;
    parts.push(`planned ${g.plannedWeekly} → ${rel}`);
  } else {
    parts.push('nothing planned this week');
  }
  if (g.projected) {
    parts.push(
      `CTL ${fmt1dp(g.ctl0)} → ${fmt1dp(g.endCtl)}, form ${Math.round(g.form0)} → ${Math.round(g.endForm)} by ${horizonLabel} (est)`,
    );
  }
  return parts.join(' · ');
}

/**
 * The week's honesty split (spec §1.1): extra load (activities with no
 * paired event) and missed work (past events with no paired activity).
 */
export interface WeekHonesty {
  extraCount: number;
  extraLoad: number;
  missedCount: number;
  missedLoad: number;
}

const TRAINING_CATEGORIES = new Set(['WORKOUT', 'RACE_A', 'RACE_B', 'RACE_C']);

export function weekHonesty(
  events: EventEx[],
  activities: Activity[],
  monday: string,
  today: string,
): WeekHonesty {
  const weekActs = activities.filter((a) => weekKey(a.start_date_local.slice(0, 10)) === monday);
  const weekEvents = events.filter(
    (e) =>
      weekKey(e.start_date_local.slice(0, 10)) === monday &&
      TRAINING_CATEGORIES.has(e.category ?? 'WORKOUT'),
  );
  const pairedEventIds = new Set(weekActs.map((a) => a.paired_event_id).filter((x): x is number => x != null));
  const out: WeekHonesty = { extraCount: 0, extraLoad: 0, missedCount: 0, missedLoad: 0 };
  for (const a of weekActs) {
    if (a.paired_event_id == null || !weekEvents.some((e) => e.id === a.paired_event_id)) {
      out.extraCount += 1;
      out.extraLoad += a.icu_training_load ?? 0;
    }
  }
  for (const e of weekEvents) {
    const done = e.id != null && pairedEventIds.has(e.id);
    if (!done && e.start_date_local.slice(0, 10) < today) {
      out.missedCount += 1;
      out.missedLoad += e.icu_training_load ?? 0;
    }
  }
  return out;
}

/** "3h07m" from seconds (sleep display). */
export function fmtHours(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `${h}h${String(m).padStart(2, '0')}m`;
}

export interface RecoveryMetric {
  /** 7-day average (newest 7 rows). */
  avg: number | null;
  /** avg(this week's 7) − avg(prior 7); null when the mirror is shallow. */
  delta: number | null;
  /** Persistent move flag (spec §1.7): HRV down ≥3d / RHR up ≥3d. */
  flag: boolean;
}

export interface RecoveryTrend {
  hrv: RecoveryMetric;
  rhr: RecoveryMetric;
  sleep: RecoveryMetric & { avgSecs: number | null; deltaSecs: number | null };
  any: boolean;
}

const avgOf = (xs: Array<number | null | undefined>): number | null => {
  const vals = xs.filter((x): x is number => typeof x === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

/** True when the newest 3 values move strictly in one direction each step. */
function persistent(days: Array<number | null | undefined>, dir: 'down' | 'up'): boolean {
  const [a, b, c] = days;
  if (typeof a !== 'number' || typeof b !== 'number' || typeof c !== 'number') return false;
  return dir === 'down' ? a < b && b < c : a > b && b > c;
}

/** Recovery context from newest-first wellness rows (spec §1.7). */
export function recoveryTrend(days: WellnessDay[]): RecoveryTrend {
  const thisWeek = days.slice(0, 7);
  const lastWeek = days.slice(7, 14);
  const metric = (
    pick: (d: WellnessDay) => number | null | undefined,
    dir: 'down' | 'up',
  ): RecoveryMetric => {
    const avg = avgOf(thisWeek.map(pick));
    const prev = avgOf(lastWeek.map(pick));
    return {
      avg,
      delta: avg != null && prev != null ? avg - prev : null,
      flag: persistent(thisWeek.map(pick), dir),
    };
  };
  const hrv = metric((d) => d.hrv, 'down');
  const rhr = metric((d) => d.restingHR, 'up');
  const sleepAvg = avgOf(thisWeek.map((d) => (d.sleepSecs ? d.sleepSecs : null)));
  const sleepPrev = avgOf(lastWeek.map((d) => (d.sleepSecs ? d.sleepSecs : null)));
  const sleep = {
    avg: sleepAvg != null ? sleepAvg / 3600 : null,
    delta: sleepAvg != null && sleepPrev != null ? (sleepAvg - sleepPrev) / 3600 : null,
    flag: false,
    avgSecs: sleepAvg,
    deltaSecs: sleepAvg != null && sleepPrev != null ? sleepAvg - sleepPrev : null,
  };
  return { hrv, rhr, sleep, any: hrv.avg != null || rhr.avg != null || sleep.avgSecs != null };
}

/** Re-export so the card can share one import site. */
export { fitnessTrend };
