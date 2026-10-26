/**
 * Offline data bridge for the Android home-screen widgets (round 16).
 *
 * The widget renderer NEVER touches the network — it renders only from a
 * snapshot this module writes into AsyncStorage (`widget.snapshot.v1`) after
 * the same mirror queries the calendar uses succeed. Everything here is
 * pure/local: compute helpers are unit tested; write/read are thin AsyncStorage
 * wrappers (the headless widget task shares the app process, so the key is
 * visible to both).
 *
 * A note on imports: @intervals/core is pure (no I/O at module scope), so the
 * widget render graph may load it. AsyncStorage itself is storage-only.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FORM_BAND_WORD, RACE_CATEGORIES, fitnessTrend, formatDuration, formatKm } from '@intervals/core';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import { MONTHS, WEEKDAY_SHORT, addDays, timeLabel, todayISO, weekdayIndex } from './dates';
import { activityLine, eventLine, relativeTime } from './format';

export const WIDGET_SNAPSHOT_KEY = 'widget.snapshot.v1';

/** Every widget taps through to the app's calendar tab (expo-router deep link). */
export const WIDGET_CALENDAR_URI = 'intervals://calendar';

/** Rewritten on foreground when the snapshot is older than this (6h). */
export const WIDGET_SNAPSHOT_STALE_MS = 6 * 60 * 60 * 1000;

/** Debounce for the fire-and-forget write after mirror queries land. */
export const WIDGET_WRITE_DEBOUNCE_MS = 800;

const RACE_SET: ReadonlySet<string> = new Set(RACE_CATEGORIES);
const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Snapshot shape (the ONLY thing the widgets render from)
// ---------------------------------------------------------------------------

export interface WidgetNextRace {
  name: string;
  /** ISO date (YYYY-MM-DD) of the start. */
  date: string;
  /** "HH:MM" from start_date_local, '' when the event has no time. */
  time: string;
  /** 0 = today, 1 = tomorrow, N = days out. */
  daysUntil: number;
}

export interface WidgetUpcomingEntry {
  date: string;
  /** "Mon".."Sun" — render-side uppercased. */
  dow: string;
  day: number;
  isToday: boolean;
  isRace: boolean;
  done: boolean;
  /** Past planned run with no recorded activity — the calendar's MISSED. */
  missed: boolean;
  /** Recorded run on a day with no planned event — renders with an "unplanned ·" metric prefix. */
  unplanned: boolean;
  name: string;
  /** Precomputed "8.5km · 45m · load 75" line (never empty — falls back).
   *  Done rows carry actuals plus "(planned …)" when targets differ;
   *  unplanned rows carry the "unplanned · " prefix. */
  metric: string;
}

export interface WidgetFitness {
  ctl: number;
  atl: number;
  /** ctl − atl (intervals.icu convention). */
  form: number;
  /** Coggan band word from the app's own model ("fresh", "fatigued", …). */
  bandWord: string;
  ctlDelta7: number | null;
  atlDelta7: number | null;
  /** Last 14 calendar days of CTL, oldest first; null where the mirror has no row. */
  series: Array<{ date: string; ctl: number | null }>;
}

export interface WidgetSnapshot {
  version: 1;
  /** Epoch ms of the write — powers the "updated Xm ago" line. */
  writtenAt: number;
  /** The write-time today (ISO) — today-highlighting matches it. */
  today: string;
  nextRace: WidgetNextRace | null;
  upcoming: WidgetUpcomingEntry[];
  fitness: WidgetFitness | null;
}

export interface WidgetSnapshotInput {
  events: EventEx[];
  activities: Activity[];
  /** Newest-first wellness rows (the app's `-date` query sort). */
  wellness: WellnessDay[];
  now?: Date;
}

// ---------------------------------------------------------------------------
// Pure compute (unit tested)
// ---------------------------------------------------------------------------

const dateOf = (startLocal: string): string => startLocal.slice(0, 10);

/** Whole days from `from` to `to` (both ISO dates; to ≥ from → positive). */
export function daysUntil(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
}

/** "21 DAYS" / "TOMORROW" / "TODAY" — the widget's big countdown line. */
export function raceCountdownLabel(daysUntil: number): string {
  if (daysUntil <= 0) return 'TODAY';
  if (daysUntil === 1) return 'TOMORROW';
  return `${daysUntil} DAYS`;
}

/** "SUN NOV 8 · 09:00" (small-caps date line; time segment omitted when absent). */
export function raceDateLine(date: string, time: string): string {
  const month = MONTHS[Number(date.slice(5, 7)) - 1]?.slice(0, 3) ?? '';
  const parts = [
    `${WEEKDAY_SHORT[weekdayIndex(date)] ?? ''} ${month} ${Number(date.slice(8, 10))}`.toUpperCase(),
  ];
  if (time) parts.push(time);
  return parts.join(' · ');
}

/** Earliest RACE_A/B/C event starting today or later; null when none. */
export function computeNextRace(events: EventEx[], today: string): WidgetNextRace | null {
  const race = events
    .filter((e) => RACE_SET.has(e.category ?? '') && dateOf(e.start_date_local) >= today)
    .sort((a, b) => dateOf(a.start_date_local).localeCompare(dateOf(b.start_date_local)))[0];
  if (!race) return null;
  const date = dateOf(race.start_date_local);
  return {
    name: race.name ?? 'Race',
    date,
    time: timeLabel(race.start_date_local),
    daysUntil: daysUntil(today, date),
  };
}

/** Training entries only — WORKOUT + RACE_*; NOTE/HOLIDAY/etc. are calendar metadata. */
export function isTrainingEvent(e: EventEx): boolean {
  const cat = e.category ?? 'WORKOUT';
  return cat === 'WORKOUT' || RACE_SET.has(cat);
}

/**
 * How many days of recorded history the upcoming list keeps behind today.
 * Without it a completed run vanishes the next day (and its planned row can
 * never show a done state) whenever the snapshot refreshed after midnight.
 */
export const WIDGET_UPCOMING_PAST_DAYS = 2;

/**
 * intervals.icu mirrors write 0 (never null) into paired_activity_id /
 * paired_event_id when there is no pairing — treating 0 as an id breaks both
 * the direct match and the same-date fallback (the round-19 done-state bug).
 */
const hasPair = (v: number | null | undefined): v is number => v != null && v !== 0;

const inWindow = (startLocal: string, today: string, days: number) => {
  const d = dateOf(startLocal);
  return d >= today && d <= addDays(today, days);
};

const byStart = (a: { start_date_local: string }, b: { start_date_local: string }) =>
  a.start_date_local.localeCompare(b.start_date_local);

/**
 * Runs for [today−2d, +windowDays] (default +14d): planned events paired with
 * their recorded activity — by paired ids (0 = no pair, see hasPair) or, for
 * legacy rows without ids, a same-date fallback — plus unpaired recorded
 * runs. Sorted by start; one row per run so multi-run days survive.
 *
 * A paired/done row shows the ACTUAL name + metrics (calendar parity), with a
 * "(planned …)" suffix for targets that differ by more than 5%; a past
 * planned row with no activity is missed; an activity on an unplanned day
 * gets its own row with an "unplanned ·" metric prefix.
 */
export function computeUpcoming(
  events: EventEx[],
  activities: Activity[],
  today: string,
  windowDays = 14,
): WidgetUpcomingEntry[] {
  const from = addDays(today, -WIDGET_UPCOMING_PAST_DAYS);
  const to = addDays(today, windowDays);
  const inList = (startLocal: string) => {
    const d = dateOf(startLocal);
    return d >= from && d <= to;
  };

  const eventList = events
    .filter((e) => isTrainingEvent(e) && inList(e.start_date_local))
    .sort(byStart);
  const actList = activities.filter((x) => inList(x.start_date_local)).sort(byStart);

  const claimed = new Set<string>();
  const pairOf = new Map<EventEx, Activity>();
  // 1. direct paired_activity_id (0 sentinel = no pair, see hasPair)
  for (const e of eventList) {
    if (!hasPair(e.paired_activity_id)) continue;
    const a = actList.find((x) => x.id === String(e.paired_activity_id));
    if (a && !claimed.has(a.id)) {
      pairOf.set(e, a);
      claimed.add(a.id);
    }
  }
  // 2. explicit reverse link (a.paired_event_id === e.id)
  for (const e of eventList) {
    if (pairOf.has(e) || e.id == null) continue;
    const a = actList.find((x) => !claimed.has(x.id) && x.paired_event_id === e.id);
    if (a) {
      pairOf.set(e, a);
      claimed.add(a.id);
    }
  }
  // 3. loose: globally closest start first — greedy event order would let an
  // earlier event steal a later run from its true (closer) event
  const candidates: Array<{ e: EventEx; a: Activity; d: number }> = [];
  for (const e of eventList) {
    if (pairOf.has(e)) continue;
    const t0 = Date.parse(e.start_date_local);
    if (Number.isNaN(t0)) continue;
    for (const x of actList) {
      if (claimed.has(x.id) || hasPair(x.paired_event_id)) continue;
      if (dateOf(x.start_date_local) !== dateOf(e.start_date_local)) continue;
      candidates.push({ e, a: x, d: Math.abs(Date.parse(x.start_date_local) - t0) });
    }
  }
  candidates.sort((p, q) => p.d - q.d);
  for (const c of candidates) {
    if (pairOf.has(c.e) || claimed.has(c.a.id)) continue;
    pairOf.set(c.e, c.a);
    claimed.add(c.a.id);
  }

  const rowOf = (
    name: string,
    isRace: boolean,
    done: boolean,
    missed: boolean,
    unplanned: boolean,
    date: string,
    metric: string,
  ): WidgetUpcomingEntry => ({
    date,
    dow: WEEKDAY_SHORT[weekdayIndex(date)] ?? '',
    day: Number(date.slice(8, 10)),
    isToday: date === today,
    isRace,
    done,
    missed,
    unplanned,
    name,
    metric,
  });

  const rows: WidgetUpcomingEntry[] = [];
  for (const e of eventList) {
    const date = dateOf(e.start_date_local);
    const isRace = RACE_SET.has(e.category ?? '');
    const act = pairOf.get(e);
    rows.push(
      rowOf(
        act?.name ?? e.name ?? 'Run',
        isRace,
        act != null,
        act == null && !isRace && date < today,
        false,
        date,
        act ? withPlannedDiff(act, e) : eventLine(e) || fallbackMetric(e),
      ),
    );
  }
  for (const a of actList) {
    if (claimed.has(a.id)) continue;
    const date = dateOf(a.start_date_local);
    const line = activityLine(a) || fallbackMetric({ type: a.type });
    rows.push(rowOf(a.name ?? 'Run', a.race === true, true, false, true, date, `unplanned · ${line}`));
  }
  // stable sort: same-day rows keep their start-time order from the loops above
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** A planned target "differs" when the actual is missing it or off by >5%. */
const targetDiffers = (planned: number | undefined, actual: number | null | undefined): boolean =>
  planned != null && planned > 0 && (actual == null || actual <= 0 || Math.abs(actual - planned) / planned > 0.05);

/** Actual metric line, suffixed " (planned …)" with the targets that differ. */
function withPlannedDiff(a: Activity, e: EventEx): string {
  const line = activityLine(a) || fallbackMetric({ type: a.type });
  const targets = [
    targetDiffers(e.distance, a.distance) ? formatKm(e.distance!) : null,
    targetDiffers(e.moving_time, a.moving_time) ? formatDuration(e.moving_time!) : null,
  ].filter((p): p is string => p != null);
  return targets.length > 0 ? `${line} (planned ${targets.join(' · ')})` : line;
}

/** Metric line for events with no distance/time/load yet ("Run", "Race day"). */
function fallbackMetric(e: { type?: string; category?: string }): string {
  return e.category === 'NOTE' ? 'note' : (e.type ?? 'run');
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Fitness state from the newest-first wellness rows — the app's own
 * `fitnessTrend` model — plus a 14-slot CTL series anchored at the latest row.
 * Null when the mirror has no usable ctl/atl yet.
 */
export function computeFitness(wellness: WellnessDay[]): WidgetFitness | null {
  const trend = fitnessTrend(wellness);
  if (!trend) return null;
  const byDate = new Map(wellness.map((d) => [d.id, d]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const date = addDays(trend.date, i - 13);
    const ctl = byDate.get(date)?.ctl;
    return { date, ctl: typeof ctl === 'number' ? round1(ctl) : null };
  });
  return {
    ctl: round1(trend.ctl),
    atl: round1(trend.atl),
    form: round1(trend.form),
    bandWord: FORM_BAND_WORD[trend.band],
    ctlDelta7: trend.ctlDelta7 == null ? null : round1(trend.ctlDelta7),
    atlDelta7: trend.atlDelta7 == null ? null : round1(trend.atlDelta7),
    series,
  };
}

/** "+2.1" / "−0.4" chip label; null hides the chip (also for null deltas). */
export function deltaLabel(d: number | null | undefined): string | null {
  if (d == null) return null;
  const r = round1(d);
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}`;
}

/** "updated 5m ago" — render-time line for the wide widgets. */
export function snapshotAgeLabel(writtenAt: number, now: Date = new Date()): string {
  return `updated ${relativeTime(new Date(writtenAt).toISOString(), now)}`;
}

// ---------------------------------------------------------------------------
// Snapshot build + storage
// ---------------------------------------------------------------------------

export function buildWidgetSnapshot(input: WidgetSnapshotInput): WidgetSnapshot {
  const now = input.now ?? new Date();
  const today = todayISO(now);
  return {
    version: 1,
    writtenAt: now.getTime(),
    today,
    nextRace: computeNextRace(input.events, today),
    upcoming: computeUpcoming(input.events, input.activities, today),
    fitness: computeFitness(input.wellness),
  };
}

export async function writeWidgetSnapshot(input: WidgetSnapshotInput): Promise<void> {
  await AsyncStorage.setItem(WIDGET_SNAPSHOT_KEY, JSON.stringify(buildWidgetSnapshot(input)));
}

/** Never throws — a corrupt/absent snapshot is just "no data yet". */
export async function readWidgetSnapshot(): Promise<WidgetSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(WIDGET_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const snap = parsed as WidgetSnapshot;
    return snap.version === 1 ? snap : null;
  } catch {
    return null;
  }
}
