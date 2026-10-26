/**
 * Widget snapshot logic (round 16): pure date math + mirror-row → snapshot
 * computes. AsyncStorage is mocked in-memory so the write/read round trip is
 * covered without the native module.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import {
  buildWidgetSnapshot,
  computeFitness,
  computeNextRace,
  computeUpcoming,
  daysUntil,
  deltaLabel,
  raceCountdownLabel,
  raceDateLine,
  readWidgetSnapshot,
  snapshotAgeLabel,
  writeWidgetSnapshot,
} from '../widget-data';

// in-memory AsyncStorage — the real package imports react-native (absent here)
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
    setItem: (k: string, v: string) => (store.set(k, v), Promise.resolve()),
  },
}));

const T0 = new Date('2026-10-24T09:30:00'); // write-time "today" = 2026-10-24

const ev = (over: Partial<EventEx>): EventEx => ({
  id: 1,
  start_date_local: '2026-11-08T09:00:00',
  category: 'WORKOUT',
  type: 'Run',
  name: 'Easy 8',
  ...over,
});

const act = (over: Partial<Activity>): Activity => ({
  id: 'i1',
  start_date_local: '2026-10-24T07:12:00',
  type: 'Run',
  name: 'Morning run',
  ...over,
});

const well = (date: string, ctl: number | null, atl: number | null): WellnessDay => ({
  id: date,
  ctl,
  atl,
});

// 10 newest-first days: ctl 50→55, atl 60→50 → form flips positive
const days = [
  well('2026-10-24', 55, 50),
  well('2026-10-23', 54, 52),
  well('2026-10-22', 53, 54),
  well('2026-10-21', 52, 56),
  well('2026-10-20', 52, 57),
  well('2026-10-19', 51, 58),
  well('2026-10-18', 51, 59),
  well('2026-10-17', 50, 60),
  well('2026-10-16', null, null), // gap: series slot renders empty
];

describe('daysUntil / countdown labels', () => {
  it('counts whole days across month ends', () => {
    expect(daysUntil('2026-10-24', '2026-10-24')).toBe(0);
    expect(daysUntil('2026-10-24', '2026-10-25')).toBe(1);
    expect(daysUntil('2026-10-24', '2026-11-08')).toBe(15);
    expect(daysUntil('2026-10-24', '2027-01-01')).toBe(69);
  });

  it('buckets the countdown label', () => {
    expect(raceCountdownLabel(0)).toBe('TODAY');
    expect(raceCountdownLabel(1)).toBe('TOMORROW');
    expect(raceCountdownLabel(21)).toBe('21 DAYS');
  });

  it('formats the small-caps date line', () => {
    expect(raceDateLine('2026-11-08', '09:00')).toBe('SUN NOV 8 · 09:00');
    expect(raceDateLine('2026-11-08', '')).toBe('SUN NOV 8');
  });
});

describe('computeNextRace', () => {
  it('picks the earliest RACE_* at or after today, ignoring workouts and past races', () => {
    const races = computeNextRace(
      [
        ev({ id: 1, category: 'RACE_B', start_date_local: '2026-12-05T10:00:00', name: 'XC Champs' }),
        ev({ id: 2, category: 'WORKOUT', start_date_local: '2026-10-26T06:00:00', name: 'Tempo' }),
        ev({ id: 3, category: 'RACE_A', start_date_local: '2026-11-08T09:00:00', name: 'Autumn 10K' }),
        ev({ id: 4, category: 'RACE_A', start_date_local: '2026-10-01T09:00:00', name: 'Past race' }),
      ],
      '2026-10-24',
    );
    expect(races).toEqual({
      name: 'Autumn 10K',
      date: '2026-11-08',
      time: '09:00',
      daysUntil: 15,
    });
  });

  it('includes a race happening today and handles missing time', () => {
    const race = computeNextRace([ev({ category: 'RACE_C', start_date_local: '2026-10-24', name: 'Parkrun' })], '2026-10-24');
    expect(race).toMatchObject({ name: 'Parkrun', daysUntil: 0, time: '' });
  });

  it('returns null with no races on the calendar', () => {
    expect(computeNextRace([ev({})], '2026-10-24')).toBeNull();
    expect(computeNextRace([], '2026-10-24')).toBeNull();
  });
});

describe('computeUpcoming', () => {
  it('windows to [today, +14d], pairs done runs, and keeps races tinted', () => {
    const rows = computeUpcoming(
      [
        ev({ id: 11, start_date_local: '2026-10-26T18:00:00', name: 'Tuesday intervals', distance: 10000, icu_training_load: 60 }),
        ev({ id: 12, start_date_local: '2026-10-24T09:00:00', name: 'Saturday long run', distance: 21000 }),
        ev({ id: 13, category: 'RACE_A', start_date_local: '2026-11-06T09:00:00', name: 'Autumn 10K', distance: 10000 }),
        ev({ id: 14, category: 'NOTE', start_date_local: '2026-10-27T08:00:00', name: 'Physio appt' }),
        ev({ id: 15, start_date_local: '2026-12-01T08:00:00', name: 'Far future' }),
      ],
      [act({ id: 'i77', start_date_local: '2026-10-24T07:12:00', name: 'Long run done', distance: 21344, moving_time: 6300, icu_training_load: 210, paired_event_id: 12 })],
      '2026-10-24',
    );
    expect(rows.map((r) => [r.date, r.name, r.done, r.isRace, r.isToday])).toEqual([
      ['2026-10-24', 'Saturday long run', true, false, true],
      ['2026-10-26', 'Tuesday intervals', false, false, false],
      ['2026-11-06', 'Autumn 10K', false, true, false],
    ]);
    // metric lines come from the recorded actuals when paired
    expect(rows[0]!.metric).toContain('21.3km');
    expect(rows[0]!.metric).toContain('load 210');
    // planned rows show plan numbers
    expect(rows[1]!.metric).toContain('10.0km');
  });

  it('falls back to a same-date unclaimed activity when pairing ids are missing', () => {
    const rows = computeUpcoming(
      [ev({ id: 20, start_date_local: '2026-10-25T06:30:00', name: 'Planned easy' })],
      [act({ id: 'a9', start_date_local: '2026-10-25T06:31:00', name: 'Easy 5', distance: 5000, moving_time: 1800 })],
      '2026-10-24',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-10-25', done: true, name: 'Planned easy' });
    expect(rows[0]!.metric).toContain('5.0km');
  });

  it('adds unpaired recorded runs and falls back on metric lines', () => {
    const rows = computeUpcoming(
      [],
      [act({ id: 'a1', start_date_local: '2026-10-24T12:00:00', name: 'Lunch shakeout' })],
      '2026-10-24',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ done: true, name: 'Lunch shakeout', isToday: true });
    expect(rows[0]!.metric).toBe('Run');
  });

  it('is empty when nothing is scheduled', () => {
    expect(computeUpcoming([], [], '2026-10-24')).toEqual([]);
  });
});

describe('computeFitness', () => {
  it('reuses the app fitness model: values, band word, 7d deltas', () => {
    const f = computeFitness(days);
    expect(f).not.toBeNull();
    expect(f!.ctl).toBe(55);
    expect(f!.atl).toBe(50);
    expect(f!.form).toBe(5);
    expect(f!.bandWord).toBe('fresh');
    expect(f!.ctlDelta7).toBe(5);
    expect(f!.atlDelta7).toBe(-10);
  });

  it('builds a 14-slot oldest-first series with null gaps', () => {
    const f = computeFitness(days)!;
    expect(f.series).toHaveLength(14);
    expect(f.series[0]).toEqual({ date: '2026-10-11', ctl: null });
    expect(f.series.at(-1)).toEqual({ date: '2026-10-24', ctl: 55 });
    const gap = f.series.find((s) => s.date === '2026-10-16');
    expect(gap).toEqual({ date: '2026-10-16', ctl: null });
  });

  it('returns null without usable ctl/atl', () => {
    expect(computeFitness([])).toBeNull();
    expect(computeFitness([well('2026-10-24', null, null)])).toBeNull();
  });
});

describe('delta / age labels', () => {
  it('labels deltas with explicit sign and hides nulls', () => {
    expect(deltaLabel(2.14)).toBe('+2.1');
    expect(deltaLabel(-0.41)).toBe('-0.4');
    expect(deltaLabel(0)).toBe('0.0');
    expect(deltaLabel(null)).toBeNull();
  });

  it('labels snapshot age in buckets', () => {
    const now = new Date('2026-10-24T12:00:00');
    expect(snapshotAgeLabel(now.getTime() - 30_000, now)).toBe('updated just now');
    expect(snapshotAgeLabel(now.getTime() - 5 * 60_000, now)).toBe('updated 5m ago');
    expect(snapshotAgeLabel(now.getTime() - 3 * 3_600_000, now)).toBe('updated 3h ago');
    expect(snapshotAgeLabel(now.getTime() - 26 * 3_600_000, now)).toBe('updated 1d ago');
  });
});

describe('snapshot round trip', () => {
  beforeEach(() => store.clear());

  it('writes and reads back the same snapshot under the fixed key', async () => {
    await writeWidgetSnapshot({
      events: [ev({ category: 'RACE_A', start_date_local: '2026-11-06T09:00:00', name: 'Autumn 10K' })],
      activities: [],
      wellness: days,
      now: T0,
    });
    expect(store.has('widget.snapshot.v1')).toBe(true);
    const snap = await readWidgetSnapshot();
    expect(snap).toEqual(buildWidgetSnapshot({ events: [ev({ category: 'RACE_A', start_date_local: '2026-11-06T09:00:00', name: 'Autumn 10K' })], activities: [], wellness: days, now: T0 }));
    expect(snap!.today).toBe('2026-10-24');
    expect(snap!.nextRace).toMatchObject({ name: 'Autumn 10K', daysUntil: 13 });
    expect(snap!.upcoming).toHaveLength(1);
    expect(snap!.fitness!.bandWord).toBe('fresh');
  });

  it('reads null for missing and corrupt snapshots', async () => {
    expect(await readWidgetSnapshot()).toBeNull();
    store.set('widget.snapshot.v1', '{not json');
    expect(await readWidgetSnapshot()).toBeNull();
    store.set('widget.snapshot.v1', JSON.stringify({ version: 99 }));
    expect(await readWidgetSnapshot()).toBeNull();
  });
});
