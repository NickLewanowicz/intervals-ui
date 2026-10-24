/**
 * Local-date math on "YYYY-MM-DD" strings, done in UTC so it never drifts
 * with the device timezone. Pure — unit tested.
 */

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function parseISO(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) throw new Error(`bad date: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toISO(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** Today in the device's local timezone (the athlete's own view). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidISO(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** N calendar days later (n may be negative). */
export function addDays(iso: string, n: number): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** Monday of iso's week (matches @intervals/core weekKey). */
export function startOfWeek(iso: string): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7; // Mon=0
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().slice(0, 10);
}

/** The 7 ISO dates of the week whose Monday is `monday`. */
export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** inclusive [from, to] covering the week (Mon..Sun). */
export function weekWindow(monday: string): { from: string; to: string } {
  return { from: monday, to: addDays(monday, 6) };
}

/** Monday-indexed weekday (Mon=0) of an ISO date. */
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "YYYY-MM-01" of the month containing iso. */
export function monthAnchor(iso: string): string {
  return iso.slice(0, 8) + '01';
}

/** Anchor N months earlier/later (clamped to month length). */
export function addMonths(anchor: string, n: number): string {
  const { y, m } = parseISO(anchor);
  const dt = new Date(Date.UTC(y, m - 1 + n, 1));
  return dt.toISOString().slice(0, 8) + '01';
}

export function daysInMonth(anchor: string): number {
  const { y, m } = parseISO(anchor);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export interface MonthGrid {
  /** rows of 7 ISO dates, always Monday-first; may spill into neighbours. */
  weeks: string[][];
  label: string; // "October 2026"
  /** inclusive window covering every cell (for PB queries). */
  from: string;
  to: string;
}

export function monthGrid(anchor: string): MonthGrid {
  const { y, m } = parseISO(anchor);
  const first = anchor;
  const last = toISO(y, m, daysInMonth(anchor));
  const lead = weekdayIndex(first); // cells before the 1st
  const gridStart = addDays(first, -lead);
  const totalCells = lead + daysInMonth(anchor);
  const rows = Math.ceil(totalCells / 7);
  const weeks: string[][] = [];
  for (let w = 0; w < rows; w++) {
    weeks.push(weekDates(addDays(gridStart, w * 7)));
  }
  return {
    weeks,
    label: `${MONTHS[m - 1]} ${y}`,
    from: weeks[0]![0]!,
    to: weeks[weeks.length - 1]![6]!,
  };
}

export function isInMonth(iso: string, anchor: string): boolean {
  return iso.slice(0, 7) === anchor.slice(0, 7);
}

/** "Mon 20" from a full ISO date. */
export function dayLabel(iso: string): string {
  return `${WEEKDAY_SHORT[weekdayIndex(iso)]} ${iso.slice(8, 10)}`;
}

/** "17:45" from "YYYY-MM-DDTHH:mm:ss" (empty when no time part). */
export function timeLabel(startLocal: string): string {
  const m = /T(\d{2}:\d{2})/.exec(startLocal);
  return m ? m[1]! : '';
}

/** "Oct 19 – Oct 25" */
export function weekRangeLabel(monday: string): string {
  const to = addDays(monday, 6);
  const fmt = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]!.slice(0, 3)} ${Number(iso.slice(8, 10))}`;
  return `${fmt(monday)} – ${fmt(to)}`;
}
