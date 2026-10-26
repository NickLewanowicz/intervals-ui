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
  it('windows to [today−2d, +14d], pairs done runs, and keeps races tinted', () => {
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
      ['2026-10-24', 'Long run done', true, false, true], // actual name wins, calendar parity
      ['2026-10-26', 'Tuesday intervals', false, false, false],
      ['2026-11-06', 'Autumn 10K', false, true, false],
    ]);
    // metric lines come from the recorded actuals when paired
    expect(rows[0]!.metric).toContain('21.3km');
    expect(rows[0]!.metric).toContain('load 210');
    // planned rows show plan numbers
    expect(rows[1]!.metric).toContain('10.0km');
    // far-future race never reaches the list
    expect(rows).toHaveLength(3);
  });

  it('THE round-19 regression: intervals.icu 0 sentinels still pair by date', () => {
    // real mirror shape: BOTH pairing columns are 0 (intervals.icu "no pair"),
    // which the old `!= null` checks treated as real ids
    const rows = computeUpcoming(
      [
        ev({
          id: 145969951,
          start_date_local: '2026-10-25T08:00:00',
          name: 'Recovery jog',
          distance: 0,
          moving_time: 3000,
          paired_activity_id: 0,
        }),
      ],
      [
        act({
          id: 'i201075229',
          start_date_local: '2026-10-25T07:42:17',
          name: 'Morning Run',
          distance: 8431.38,
          moving_time: 2400,
          paired_event_id: 0,
        }),
      ],
      '2026-10-25',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-10-25', done: true, missed: false, unplanned: false, isToday: true });
    expect(rows[0]!.name).toBe('Morning Run');
    // actuals with the differing planned target as suffix (50m vs 40m)
    expect(rows[0]!.metric).toContain('8.4km');
    expect(rows[0]!.metric).toContain('(planned 50m)');
  });

  it('falls back to a same-date unclaimed activity when pairing ids are missing', () => {
    const rows = computeUpcoming(
      [ev({ id: 20, start_date_local: '2026-10-25T06:30:00', name: 'Planned easy' })],
      [act({ id: 'a9', start_date_local: '2026-10-25T06:31:00', name: 'Easy 5', distance: 5000, moving_time: 1800 })],
      '2026-10-24',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: '2026-10-25', done: true, name: 'Easy 5' });
    expect(rows[0]!.metric).toContain('5.0km');
  });

  it('pairs an explicit reverse paired_event_id even across a same-date crowd', () => {
    const rows = computeUpcoming(
      [ev({ id: 30, start_date_local: '2026-10-24T18:00:00', name: 'Evening tempo' })],
      [
        act({ id: 'x1', start_date_local: '2026-10-24T08:00:00', name: 'Stray shakeout', distance: 3000, paired_event_id: 0 }),
        act({ id: 'x2', start_date_local: '2026-10-24T18:05:00', name: 'Tempo done', distance: 9000, paired_event_id: 30 }),
      ],
      '2026-10-24',
    );
    const tempo = rows.find((r) => r.name === 'Tempo done');
    expect(tempo).toMatchObject({ done: true, unplanned: false });
    // the stray same-date run keeps its own unplanned row
    const stray = rows.find((r) => r.name === 'Stray shakeout');
    expect(stray).toMatchObject({ done: true, unplanned: true });
    expect(stray!.metric).toMatch(/^unplanned · /);
  });

  it('loose pairing picks the closest-start activity, not the first event', () => {
    // two same-day events + one activity: the 08:30 event is closer to the
    // 09:00 run than the 08:00 event and must win (round-19 temp-mirror case)
    const rows = computeUpcoming(
      [
        ev({ id: 70, start_date_local: '2026-10-25T08:00:00', name: 'Recovery jog', moving_time: 1800, paired_activity_id: 0 }),
        ev({ id: 71, start_date_local: '2026-10-25T08:30:00', name: 'Paired tempo', moving_time: 2400, paired_activity_id: 0 }),
      ],
      [act({ id: 'y1', start_date_local: '2026-10-25T09:00:00', name: 'Tempo done', distance: 8700, moving_time: 2100, paired_event_id: 0 })],
      '2026-10-25',
    );
    const tempo = rows.find((r) => r.done);
    expect(tempo).toMatchObject({ name: 'Tempo done' });
    expect(tempo!.metric).toContain('(planned 40m)'); // the 08:30 event's target
    const recovery = rows.find((r) => r.name === 'Recovery jog');
    expect(recovery).toMatchObject({ done: false, missed: false }); // today, still planned
  });

  it('keeps past days: done survives a stale snapshot, unplanned days still render', () => {
    const rows = computeUpcoming(
      [
        ev({ id: 40, start_date_local: '2026-10-25T08:00:00', name: 'Sunday easy', moving_time: 1800, paired_activity_id: 0 }),
        ev({ id: 41, start_date_local: '2026-10-24T08:00:00', name: 'Saturday long', moving_time: 5400, paired_activity_id: 0 }),
      ],
      [
        act({ id: 's1', start_date_local: '2026-10-25T09:00:00', name: 'Morning Run', distance: 8431, moving_time: 2869, paired_event_id: 0 }),
        act({ id: 's2', start_date_local: '2026-10-23T09:00:00', name: 'Too old', distance: 4000, paired_event_id: 0 }),
      ],
      '2026-10-26', // Monday, looking back at the weekend
    );
    // Sunday run done (planned row + actual merge), inside the 2-day lookback
    const sunday = rows.find((r) => r.date === '2026-10-25');
    expect(sunday).toMatchObject({ done: true, missed: false, isToday: false });
    expect(sunday!.metric).toContain('(planned 30m)');
    // Saturday planned run never recorded → missed, still listed
    const saturday = rows.find((r) => r.date === '2026-10-24');
    expect(saturday).toMatchObject({ done: false, missed: true });
    // older than the 2-day lookback → dropped entirely
    expect(rows.find((r) => r.date === '2026-10-23')).toBeUndefined();
  });

  it('marks a past race without a result as race, not missed', () => {
    const rows = computeUpcoming(
      [ev({ id: 50, category: 'RACE_A', start_date_local: '2026-10-25T09:00:00', name: 'Autumn 10K' })],
      [],
      '2026-10-26',
    );
    expect(rows[0]).toMatchObject({ done: false, missed: false, isRace: true });
  });

  it('adds unpaired recorded runs and falls back on metric lines', () => {
    const rows = computeUpcoming(
      [],
      [act({ id: 'a1', start_date_local: '2026-10-24T12:00:00', name: 'Lunch shakeout' })],
      '2026-10-24',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ done: true, unplanned: true, name: 'Lunch shakeout', isToday: true });
    expect(rows[0]!.metric).toBe('unplanned · Run');
  });

  it('omits the (planned …) suffix when actuals land within 5% of targets', () => {
    const rows = computeUpcoming(
      [ev({ id: 60, start_date_local: '2026-10-24T08:00:00', name: 'Easy 6', distance: 6000, moving_time: 2100, paired_activity_id: 0 })],
      [act({ id: 'b1', start_date_local: '2026-10-24T08:20:00', name: 'Easy 6', distance: 6150, moving_time: 2200, paired_event_id: 0 })],
      '2026-10-24',
    );
    expect(rows[0]!.done).toBe(true);
    expect(rows[0]!.metric).not.toContain('planned');
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
