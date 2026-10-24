import { describe, expect, it } from 'vitest';
import { weekKey } from '@intervals/core';
import {
  addDays,
  addMonths,
  dayLabel,
  daysInMonth,
  isValidISO,
  monthAnchor,
  monthGrid,
  startOfWeek,
  timeLabel,
  todayISO,
  weekDates,
  weekRangeLabel,
  weekWindow,
} from '../dates';

describe('date math', () => {
  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap year
    expect(addDays('2026-10-20', -7)).toBe('2026-10-13');
  });

  it('startOfWeek returns Monday (agrees with core weekKey)', () => {
    // 2026-10-24 is a Saturday
    expect(startOfWeek('2026-10-24')).toBe('2026-10-19');
    // Sunday belongs to the previous Monday
    expect(startOfWeek('2026-10-25')).toBe('2026-10-19');
    // Monday maps to itself
    expect(startOfWeek('2026-10-19')).toBe('2026-10-19');
    for (const d of ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-12-31', '2027-01-01']) {
      expect(startOfWeek(d)).toBe(weekKey(d));
    }
  });

  it('weekDates lists Mon..Sun', () => {
    expect(weekDates('2026-10-19')).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('weekWindow is inclusive Mon..Sun', () => {
    expect(weekWindow('2026-10-19')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('todayISO yields a valid local date', () => {
    expect(isValidISO(todayISO())).toBe(true);
  });

  it('isValidISO rejects malformed dates', () => {
    expect(isValidISO('2026-13-01')).toBe(false);
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('2026-10-20T00:00:00')).toBe(false);
    expect(isValidISO('')).toBe(false);
  });

  it('month math', () => {
    expect(monthAnchor('2026-10-24')).toBe('2026-10-01');
    expect(addMonths('2026-10-01', 1)).toBe('2026-11-01');
    expect(addMonths('2026-01-01', -1)).toBe('2025-12-01');
    expect(addMonths('2026-08-31', -0)).toBe('2026-08-01');
    expect(daysInMonth('2026-02-01')).toBe(28);
    expect(daysInMonth('2028-02-01')).toBe(29);
  });

  it('monthGrid builds Monday-first weeks covering the whole month', () => {
    const g = monthGrid('2026-10-01');
    expect(g.label).toBe('October 2026');
    // Oct 1 2026 is a Thursday → 3 lead cells
    expect(g.weeks[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    // Oct 31 is a Saturday → the last week ends 2026-11-01
    expect(g.weeks[g.weeks.length - 1]![6]).toBe('2026-11-01');
    expect(g.from).toBe('2026-09-28');
    expect(g.to).toBe('2026-11-01');
    const all = g.weeks.flat();
    expect(new Set(all).size).toBe(all.length); // no dupes
    expect(all).toContain('2026-10-31');
  });

  it('monthGrid for a 28-day February starting Sunday spans 5 rows', () => {
    // 2026-02-01 is a Sunday → 6 lead cells, 28 days → 34 cells → 5 rows
    const g = monthGrid('2026-02-01');
    expect(g.weeks.length).toBe(5);
  });

  it('labels', () => {
    expect(dayLabel('2026-10-20')).toBe('Tue 20');
    expect(timeLabel('2026-10-20T17:45:00')).toBe('17:45');
    expect(timeLabel('2026-10-20')).toBe('');
    expect(weekRangeLabel('2026-10-19')).toBe('Oct 19 – Oct 25');
  });
});
