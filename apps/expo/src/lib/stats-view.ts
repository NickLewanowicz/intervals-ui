/**
 * Pure view-model builders for the calendar hero card (metrics spec
 * docs/research/athlete-dashboard-metrics.md §3 + design spec
 * docs/design/calendar-home-v2-spec.md: metric tiles + tooltip copy — no
 * exposed prose on the card) and for the coach drill-down sheet
 * (docs/design/calendar-hero-v4-spec.md: the deterministic coach status
 * paragraph). All number formatting + text assembly lives here so it is
 * unit-testable; components only render.
 *
 * Spec §0 conventions: load integers · distance 1dp · CTL/ATL 1dp ·
 * form/drift/percentages integers · projections marked (est) · load is never
 * fabricated.
 */
import {
  fitnessTrend,
  formatDuration,
  formatKm,
  formBand,
  FORM_BAND_WORD,
  loadToHoldFlat,
  project,
  weekKey,
  ctlFlatWeeklyLoad,
  type EventEx,
  type Activity,
  type FitnessTrend,
  type FenceRider,
  type WellnessDay,
  type ZoneBalance,
} from '@intervals/core';
import { dayLabel } from '@/lib/dates';

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

/**
 * Trend direction for a delta: drives the small directional ICON inside a
 * sub-chip (never a bare unicode arrow). Flat within ±flatBand.
 */
export type TrendDir = 'up' | 'down' | 'flat';

export function trendDir(delta: number | null | undefined, flatBand = 0.05): TrendDir {
  if (delta == null || Math.abs(delta) < flatBand) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

// ---------------------------------------------------------------------------
// Tile models (design spec §2): icon? + small-caps label + BIG value + sub
// chip (colored text + optional directional icon). Tone = chip color:
// better = success green · worse = danger red · neutral = muted.
// ---------------------------------------------------------------------------

export type TileTone = 'better' | 'worse' | 'neutral';

export interface TileSub {
  text: string;
  tone: TileTone;
  dir?: TrendDir;
  /** True for the planned/target value — rendered with a flag icon, no word. */
  planned?: boolean;
}

export interface TileModel {
  id: string;
  label: string;
  value: string;
  /** Value ink tone; undefined = default text color. */
  valueTone?: TileTone;
  sub?: TileSub | null;
  /** Tooltip content (definition / callout) rendered as an info hint. */
  hint?: string | null;
}

/** The window-aggregated stats the hero tiles read (subset of WeeklyStats). */
export interface SummaryStatsInput {
  plannedDistanceM: number;
  plannedTimeSec: number;
  plannedLoad: number;
  actualDistanceM: number;
  actualTimeSec: number;
  actualLoad: number;
  longestRunM: number;
  plannedDistanceEstimated?: boolean;
  plannedTimeEstimated?: boolean;
}

const plannedPrefix = (estimated?: boolean) => (estimated ? '≈' : '');

/** Distance / Time / Load tiles: BIG actual value, muted "planned" sub-chip. */
export function summaryTiles(s: SummaryStatsInput): TileModel[] {
  return [
    {
      id: 'distance',
      label: 'Distance',
      value: s.actualDistanceM > 0 ? formatKm(s.actualDistanceM) : '—',
      sub:
        s.plannedDistanceM > 0
          ? {
              text: `${plannedPrefix(s.plannedDistanceEstimated)}${formatKm(s.plannedDistanceM)}`,
              tone: 'neutral',
              planned: true,
            }
          : null,
    },
    {
      id: 'time',
      label: 'Time',
      value: s.actualTimeSec > 0 ? formatDuration(s.actualTimeSec) : '—',
      sub:
        s.plannedTimeSec > 0
          ? {
              text: `${plannedPrefix(s.plannedTimeEstimated)}${formatDuration(s.plannedTimeSec)}`,
              tone: 'neutral',
              planned: true,
            }
          : null,
    },
    {
      id: 'load',
      label: 'Load',
      value: s.actualLoad > 0 ? String(Math.round(s.actualLoad)) : '—',
      sub:
        s.plannedLoad > 0
          ? { text: `${Math.round(s.plannedLoad)}`, tone: 'neutral', planned: true }
          : null,
    },
  ];
}

/**
 * Per-tile tooltip copy (definitions live in tooltips, never exposed prose).
 * Distance also carries the longest-run callout so the data survives the
 * 4-tile strip.
 */
export function tileHints(s: SummaryStatsInput): Record<string, string | null> {
  const distance: string[] = [];
  if (s.plannedDistanceEstimated) {
    distance.push('Planned distance is estimated from planned time at your recent pace.');
  }
  if (s.longestRunM > 0) distance.push(`Longest run this week: ${formatKm(s.longestRunM)}.`);
  return {
    distance: distance.length ? distance.join(' ') : null,
    time: s.plannedTimeEstimated
      ? 'Planned time is missing on the event, so pace is estimated from your recent runs.'
      : null,
    load: 'Load is intervals.icu training load (TRIMP): duration weighted by intensity.',
  };
}

// ---------------------------------------------------------------------------
// Form ring (design spec §2): position on the fresh/fatigued band. The ring
// sweep is the form value clamped onto the Coggan band scale +30..-30.
// ---------------------------------------------------------------------------

export interface RingModel {
  /** 0..1 sweep of the ring (0 = deeply fatigued end, 1 = very fresh end). */
  fraction: number;
  word: string;
  tone: TileTone;
}

const RING_MIN = -30;
const RING_MAX = 30;

export function formRingModel(form: number): RingModel {
  const raw = (form - RING_MIN) / (RING_MAX - RING_MIN);
  const fraction = Math.min(1, Math.max(0, raw));
  const band = formBand(form);
  const tone: TileTone =
    band === 'very-fresh' || band === 'fresh'
      ? 'better'
      : band === 'fatigued' || band === 'deeply-fatigued'
        ? 'worse'
        : 'neutral';
  return { fraction, word: FORM_BAND_WORD[band], tone };
}

/** The FORM hero tile: ring + signed value + band-word chip. */
export interface FormTileModel extends TileModel {
  ring: RingModel;
}

export function formTileModel(
  trend: FitnessTrend | null,
  loading: boolean,
): FormTileModel | null {
  if (!trend) {
    if (!loading) return null;
    return { id: 'form', label: 'Form', value: '…', sub: null, ring: { fraction: 0.5, word: '…', tone: 'neutral' } };
  }
  const ring = formRingModel(trend.form);
  const d = trend.formDelta7;
  return {
    id: 'form',
    label: 'Form',
    value: signedInt(trend.form),
    valueTone: ring.tone,
    sub:
      d == null
        ? { text: ring.word, tone: ring.tone }
        : {
            text: Math.abs(d) < 1 ? `${ring.word} · steady` : `${ring.word} · ${signedInt(d)}/wk`,
            tone: Math.abs(d) < 1 ? 'neutral' : d > 0 ? 'better' : 'worse',
            dir: trendDir(d, 1),
          },
    hint: 'Form = fitness (CTL) minus fatigue (ATL). Positive means fresh, negative means carrying fatigue.',
    ring,
  };
}

/** FITNESS drawer mini-tiles: CTL + ATL with weekly delta chips. */
export function fitnessTiles(trend: FitnessTrend): TileModel[] {
  const ctl: TileModel = {
    id: 'ctl',
    label: 'CTL · fitness',
    value: fmt1dp(trend.ctl),
    sub:
      trend.ctlDelta7 != null
        ? {
            text: `${signedInt(trend.ctlDelta7)}/wk`,
            tone: trend.ctlDelta7 > 0.05 ? 'better' : trend.ctlDelta7 < -0.05 ? 'worse' : 'neutral',
            dir: trendDir(trend.ctlDelta7),
          }
        : null,
    hint: trend.detraining
      ? 'Fresher, but fitness falling — this is detraining, not a taper (est).'
      : 'CTL: 42-day exponentially-weighted average load — your fitness base.',
  };
  const atl: TileModel = {
    id: 'atl',
    label: 'ATL · fatigue',
    value: fmt1dp(trend.atl),
    sub:
      trend.atlDelta7 != null
        ? {
            text: `${signedInt(trend.atlDelta7)}/wk`,
            tone: trend.atlDelta7 > 0.05 ? 'worse' : trend.atlDelta7 < -0.05 ? 'better' : 'neutral',
            dir: trendDir(trend.atlDelta7),
          }
        : null,
    hint: 'ATL: 7-day exponentially-weighted average load — your current fatigue.',
  };
  return [ctl, atl];
}

// ---------------------------------------------------------------------------
// Coach drill-down bubble (calendar-hero-v4 spec §1): the deterministic 2-3
// sentence status paragraph that replaced the card's verdict sentence. Same
// pure inputs as the old verdict (trend + the live week's loads) plus the
// weekly zone rollup. Numbers-first, no platitudes, no LLM call.
// ---------------------------------------------------------------------------

export interface CoachStatusInput {
  /** Latest fitness trend (null = no usable wellness rows yet). */
  trend: FitnessTrend | null;
  /** Planned load for the CURRENT week (the hold-flat comparison). */
  plannedLoad: number;
  /** Actual load recorded so far in the CURRENT week. */
  actualLoad: number;
  /** Weekly zone rollup (week view only; omitted in month scope). */
  zones?: ZoneBalance | null;
}

/**
 * The worst zone finding as one sentence; null when the week is healthy (or
 * there is no zone data — month scope). Priority: moderate trap / LOW red →
 * MOD red → HIGH red → ambers.
 */
export function zoneStatusLine(zones?: ZoneBalance | null): string | null {
  if (!zones || zones.totalSecs <= 0) return null;
  if (zones.moderateTrap || zones.lowFlag === 'red')
    return `Zone mix leans moderate — LOW ${zones.lowPct}% against a ~75-80% easy target.`;
  if (zones.modFlag === 'red') return `Z3/SS is ${zones.modPct}% of the week — threshold-heavy.`;
  if (zones.highFlag === 'red') return `Hard work is ${zones.highPct}% of the week, over the 25% ceiling.`;
  if (zones.lowFlag === 'amber') return `Easy work is drifting — LOW ${zones.lowPct}% (target ~75-80%).`;
  if (zones.modFlag === 'amber') return `Moderate work is drifting up — ${zones.modPct}% of the week.`;
  return null;
}

/**
 * The coach bubble paragraph (calendar-hero-v4 spec §1): load vs hold-flat →
 * form + direction → worst zone finding. Deterministic from the same stats
 * the tiles show; hold-flat keeps its ≈ estimate mark, detraining its (est).
 */
export function coachStatusParagraph({
  trend,
  plannedLoad,
  actualLoad,
  zones,
}: CoachStatusInput): string | null {
  const sentences: string[] = [];

  // 1 — load vs hold-flat: the steering read.
  const hold = trend != null ? Math.round(loadToHoldFlat(trend.ctl, trend.atl)) : null;
  if (hold != null) {
    if (plannedLoad > 0) {
      const planned = Math.round(plannedLoad);
      const clause =
        planned > hold + 2
          ? "you're loading more than you're shedding"
          : planned < hold - 2
            ? 'the week sheds more than it loads'
            : 'roughly holding form flat';
      sentences.push(
        `You're at ${Math.round(actualLoad)} of ${planned} planned load against a hold-flat of ≈${hold}/wk — ${clause}.`,
      );
    } else if (actualLoad > 0) {
      sentences.push(
        `You're at ${Math.round(actualLoad)} load with nothing planned yet — hold-flat is ≈${hold}/wk.`,
      );
    } else {
      sentences.push(`Nothing is planned yet — hold-flat is ≈${hold}/wk.`);
    }
  } else if (plannedLoad > 0 || actualLoad > 0) {
    sentences.push(`You're at ${Math.round(actualLoad)} of ${Math.round(plannedLoad)} planned load this week.`);
  }

  // 2 — form: signed value + band word + weekly direction (detraining wins).
  if (trend) {
    if (trend.detraining && trend.ctlDelta7 != null) {
      sentences.push(
        `Form is ${signedInt(trend.form)} (${FORM_BAND_WORD[trend.band]}) but fitness is falling ${signedInt(trend.ctlDelta7)}/wk — detraining, not a taper (est).`,
      );
    } else {
      const d = trend.formDelta7;
      const dir =
        d == null || Math.abs(d) < 1
          ? ', steady'
          : d < 0
            ? ` but trending down ~${Math.abs(Math.round(d))}/wk`
            : ` and trending up ~${Math.round(d)}/wk`;
      sentences.push(`Form is ${signedInt(trend.form)} (${FORM_BAND_WORD[trend.band]})${dir}.`);
    }
  }

  // 3 — the worst zone finding (week view only).
  const zoneLine = zoneStatusLine(zones);
  if (zoneLine) sentences.push(zoneLine);

  if (sentences.length > 0) return sentences.join(' ');
  return 'No wellness data yet — sync and your training status will show up here.';
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

/** One row, three stat chips (design spec §4) + the definition as tooltip copy. */
export interface GapChip {
  id: string;
  label: string;
  value: string;
  tone: TileTone;
}

export interface GapCopy {
  chips: [GapChip, GapChip, GapChip];
  /** InfoHint content: hold-flat definition + projection + adherence notes. */
  tooltip: string[];
}

export function gapCopy(
  g: GapModel,
  horizonLabel: string,
  honesty?: WeekHonesty | null,
): GapCopy {
  const chips: [GapChip, GapChip, GapChip] = [
    { id: 'hold', label: 'Hold-flat', value: `${g.holdWeekly}/wk`, tone: 'neutral' },
    { id: 'you', label: 'You', value: `${g.plannedWeekly}`, tone: 'neutral' },
    {
      id: 'gap',
      label: 'Gap',
      value: signedInt(g.gapWeekly),
      // negative gap = over hold-flat = fatigue incoming (red); under is neutral (a recovery week is legal)
      tone: g.gapWeekly < 0 ? 'worse' : 'neutral',
    },
  ];
  const tooltip: string[] = [
    `Hold-flat = the weekly load that keeps form exactly where it is. Fitness-flat would be ${Math.round(ctlFlatWeeklyLoad(g.ctl0))}/wk; hold-flat adjusts for the form you're carrying.`,
  ];
  if (g.plannedWeekly === 0) tooltip.push('Nothing is planned this week yet.');
  if (g.projected) {
    tooltip.push(
      `By ${horizonLabel} at this pace: CTL ${fmt1dp(g.ctl0)} to ${fmt1dp(g.endCtl)}, form ${Math.round(g.form0)} to ${Math.round(g.endForm)} (est).`,
    );
  }
  if (honesty && (honesty.extraCount > 0 || honesty.missedCount > 0)) {
    if (honesty.extraCount > 0) {
      tooltip.push(
        `${Math.round(honesty.extraLoad)} load unplanned (${honesty.extraCount} extra run${honesty.extraCount > 1 ? 's' : ''}).`,
      );
    }
    if (honesty.missedCount > 0) {
      tooltip.push(`${honesty.missedCount} missed (${Math.round(honesty.missedLoad)} load).`);
    }
  }
  return { chips, tooltip };
}

/**
 * Zone balance findings as compact flagged chips (design spec §4): one line,
 * full sentences live inside the hover/press tooltips — including the
 * moderate-trap and fence-rider callouts.
 */
export type ChipTone = 'neutral' | 'amber' | 'red';

export interface FlagChipModel {
  id: string;
  label: string;
  tone: ChipTone;
  detail: string;
}

export function zoneFlagChips(
  zones: ZoneBalance,
  riders: FenceRider[],
  activities: Activity[],
): FlagChipModel[] {
  const riderLines = riders
    .slice(0, 2)
    .map((r) => {
      const act = activities.find((a) => a.id === r.id);
      const day = act ? `${dayLabel(act.start_date_local.slice(0, 10))} ` : '';
      return `${day}"${r.name ?? 'run'}" sat in Z3 ${r.z3Pct}% — this is where the trap lives.`;
    })
    .join(' ');
  const low: FlagChipModel = {
    id: 'low',
    label: `LOW ${zones.lowPct}%`,
    tone: zones.lowFlag === 'red' ? 'red' : zones.lowFlag === 'amber' ? 'amber' : 'neutral',
    detail:
      zones.lowFlag === 'red'
        ? `LOW ${zones.lowPct}% — moderate-trap warning: the week is mostly middle intensity.`
        : zones.lowFlag === 'amber'
          ? `LOW ${zones.lowPct}% — easy runs are drifting.`
          : 'Easy work (Z1-Z2) should be ~75-80% of a healthy week.',
  };
  if (riderLines) low.detail = `${low.detail} ${riderLines}`.trim();
  const mod: FlagChipModel = {
    id: 'mod',
    label: `MOD ${zones.modPct}%`,
    tone: zones.modFlag === 'red' ? 'red' : zones.modFlag === 'amber' ? 'amber' : 'neutral',
    detail:
      zones.modFlag === 'red'
        ? `MOD ${zones.modPct}% — threshold-heavy weeks add fatigue without fitness.`
        : zones.modFlag === 'amber'
          ? `MOD ${zones.modPct}% — drifting up.`
          : 'Moderate (Z3/SS) should stay at or under 10% of the week.',
  };
  if (zones.moderateTrap) {
    mod.detail = `${mod.detail} Mostly-middle weeks are the classic moderate trap.`;
  }
  const high: FlagChipModel = {
    id: 'high',
    label: `HIGH ${zones.highPct}%`,
    tone: zones.highFlag === 'red' ? 'red' : 'neutral',
    detail:
      zones.highFlag === 'red'
        ? `HIGH ${zones.highPct}% — above the 2-quality-sessions ceiling.`
        : 'Hard work (Z4+) should stay at or under 25% of the week.',
  };
  return [low, mod, high];
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

/** RECOVERY drawer mini-tiles: 7-day averages with weekly delta chips. */
export function recoveryTiles(recovery: RecoveryTrend): TileModel[] {
  const tiles: TileModel[] = [];
  if (recovery.hrv.avg != null) {
    const d = recovery.hrv.delta;
    tiles.push({
      id: 'hrv',
      label: 'HRV',
      value: recovery.hrv.avg.toFixed(1),
      sub:
        d != null && Math.abs(d) >= 0.5
          ? {
              text: signedInt(d),
              tone: d > 0 ? 'better' : 'worse',
              dir: trendDir(d, 0.05),
            }
          : null,
      hint: recovery.hrv.flag
        ? 'HRV down 3 days running — worth easing off.'
        : '7-day average heart-rate variability vs the prior 7 days. Rising is good.',
    });
  }
  if (recovery.rhr.avg != null) {
    const d = recovery.rhr.delta;
    tiles.push({
      id: 'rhr',
      label: 'RHR',
      value: String(Math.round(recovery.rhr.avg)),
      sub:
        d != null && Math.abs(d) >= 0.5
          ? {
              text: signedInt(d),
              tone: d < 0 ? 'better' : 'worse',
              dir: trendDir(d, 0.05),
            }
          : null,
      hint: recovery.rhr.flag
        ? 'Resting HR up 3 days running.'
        : '7-day average resting heart rate vs the prior 7 days. Falling is good.',
    });
  }
  if (recovery.sleep.avgSecs != null) {
    const d = recovery.sleep.deltaSecs;
    tiles.push({
      id: 'sleep',
      label: 'Sleep',
      value: fmtHours(recovery.sleep.avgSecs),
      sub:
        d != null && Math.abs(d) >= 1800
          ? {
              text: `${signedInt(d / 3600)}h`,
              tone: d > 0 ? 'better' : 'worse',
              dir: trendDir(d, 1),
            }
          : null,
      hint: '7-day average sleep duration vs the prior 7 days.',
    });
  }
  return tiles;
}

/** True when at least one drawer section has content. */
export function hasDetails(
  zones: ZoneBalance | null,
  gap: GapModel | null,
  recovery: RecoveryTrend,
  trend: FitnessTrend | null,
): boolean {
  return (zones != null && zones.totalSecs > 0) || gap != null || recovery.any || trend != null;
}

/** Re-export so the card can share one import site. */
export { fitnessTrend };
