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
import { FORM_BAND_WORD, RACE_CATEGORIES, fitnessTrend } from '@intervals/core';
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
  name: string;
  /** Precomputed "8.5km · 45m · load 75" line (never empty — falls back). */
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

const inWindow = (startLocal: string, today: string, days: number) => {
  const d = dateOf(startLocal);
  return d >= today && d <= addDays(today, days);
};

const byStart = (a: { start_date_local: string }, b: { start_date_local: string }) =>
  a.start_date_local.localeCompare(b.start_date_local);

/**
 * Runs for the next `windowDays` days (default 14): planned events paired
 * with their recorded activity (paired_activity_id, falling back to an
 * unclaimed activity on the same date for legacy rows without pairing ids),
 * plus unpaired recorded runs. Sorted by start; one row per run so multi-run
 * days survive.
 */
export function computeUpcoming(
  events: EventEx[],
  activities: Activity[],
  today: string,
  windowDays = 14,
): WidgetUpcomingEntry[] {
  const claimed = new Set<string>();
  const findPair = (e: EventEx): Activity | undefined => {
    if (e.paired_activity_id != null) {
      const id = String(e.paired_activity_id);
      const a = activities.find((x) => x.id === id);
      if (a) {
        claimed.add(id);
        return a;
      }
    }
    // date-match fallback: an activity the same day not claimed by any event —
    // including ones whose ONLY link is the reverse paired_event_id
    const date = dateOf(e.start_date_local);
    const a = activities.find(
      (x) =>
        !claimed.has(x.id) &&
        (x.paired_event_id == null || x.paired_event_id === e.id) &&
        dateOf(x.start_date_local) === date,
    );
    if (a) {
      claimed.add(a.id);
      return a;
    }
    return undefined;
  };

  const rowOf = (name: string, isRace: boolean, done: boolean, date: string, metric: string): WidgetUpcomingEntry => ({
    date,
    dow: WEEKDAY_SHORT[weekdayIndex(date)] ?? '',
    day: Number(date.slice(8, 10)),
    isToday: date === today,
    isRace,
    done,
    name,
    metric,
  });

  const rows: WidgetUpcomingEntry[] = [];
  for (const e of events.filter((e) => isTrainingEvent(e) && inWindow(e.start_date_local, today, windowDays)).sort(byStart)) {
    const date = dateOf(e.start_date_local);
    const act = findPair(e);
    rows.push(
      rowOf(
        e.name ?? act?.name ?? 'Run',
        RACE_SET.has(e.category ?? ''),
        act != null,
        date,
        act ? activityLine(act) : eventLine(e) || fallbackMetric(e),
      ),
    );
  }
  for (const a of activities
    .filter((x) => !claimed.has(x.id) && inWindow(x.start_date_local, today, windowDays))
    .sort(byStart)) {
    const date = dateOf(a.start_date_local);
    rows.push(
      rowOf(a.name ?? 'Run', a.race === true, true, date, activityLine(a) || fallbackMetric({ type: a.type })),
    );
  }
  // stable sort: same-day rows keep their start-time order from the loops above
  return rows.sort((a, b) => a.date.localeCompare(b.date));
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
