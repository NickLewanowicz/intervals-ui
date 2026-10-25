import { describe, expect, it } from 'vitest';
import {
  activityDate,
  averagePaceMinPerKm,
  buildDayCells,
  eventDate,
  formatDuration,
  formatPace,
  form,
  isRaceEvent,
  weeklyStats,
  weekKey,
  wellnessSummary,
} from '../src/stats';
import type { Activity, EventEx, WellnessDay } from '../src/types';

const ev = (over: Partial<EventEx>): EventEx => ({
  start_date_local: '2026-10-24T08:00:00',
  ...over,
});

const act = (over: Partial<Activity>): Activity => ({
  id: 'i1',
  start_date_local: '2026-10-24T08:00:00',
  ...over,
});

describe('date helpers', () => {
  it('slices athlete-local dates', () => {
    expect(eventDate(ev({ start_date_local: '2026-10-27T17:45:00' }))).toBe('2026-10-27');
    expect(activityDate(act({ start_date_local: '2026-10-20T06:00:00' }))).toBe('2026-10-20');
  });

  it('weekKey is Monday-start', () => {
    expect(weekKey('2026-10-24')).toBe('2026-10-19'); // Saturday → its Monday
    expect(weekKey('2026-10-19')).toBe('2026-10-19'); // Monday → itself
    expect(weekKey('2026-10-18')).toBe('2026-10-12'); // Sunday → previous Monday
  });
});

describe('buildDayCells', () => {
  it('groups events and activities per date', () => {
    const cells = buildDayCells(
      [ev({ start_date_local: '2026-10-20T17:45:00', id: 1 })],
      [act({ start_date_local: '2026-10-20T17:47:53', paired_event_id: 1 })],
    );
    const day = cells.get('2026-10-20');
    expect(day?.events).toHaveLength(1);
    expect(day?.activities).toHaveLength(1);
    expect(cells.get('2026-10-21')).toBeUndefined();
  });
});

describe('isRaceEvent', () => {
  it('recognizes RACE_* categories only', () => {
    expect(isRaceEvent(ev({ category: 'RACE_A' }))).toBe(true);
    expect(isRaceEvent(ev({ category: 'RACE_C' }))).toBe(true);
    expect(isRaceEvent(ev({ category: 'WORKOUT' }))).toBe(false);
    expect(isRaceEvent(undefined)).toBe(false);
  });
});

describe('weeklyStats', () => {
  const events = [
    ev({ start_date_local: '2026-10-20T06:00:00', distance: 8000, moving_time: 2400, icu_training_load: 50 }),
    ev({ start_date_local: '2026-10-21T06:00:00', distance: 12000, moving_time: 3600, icu_training_load: 70 }),
    // next week — must not count
    ev({ start_date_local: '2026-10-27T06:00:00', distance: 5000, moving_time: 1500, icu_training_load: 30 }),
  ];
  const activities = [
    act({
      start_date_local: '2026-10-20T06:10:00',
      distance: 8823.44,
      moving_time: 2935,
      icu_training_load: 92,
      icu_zone_times: [
        { id: 'Z1', secs: 706 },
        { id: 'Z4', secs: 555 },
      ],
    }),
    act({ start_date_local: '2026-10-21T06:05:00', distance: 12000, moving_time: 3600, icu_training_load: 71, race: true }),
  ];

  it('sums planned vs actual within one Monday-week', () => {
    const s = weeklyStats(events, activities, '2026-10-19');
    expect(s.plannedDistanceM).toBe(20000);
    expect(s.actualDistanceM).toBeCloseTo(20823.44, 2);
    expect(s.actualLoad).toBe(163);
    expect(s.plannedLoad).toBe(120);
    expect(s.runs).toBe(2);
    expect(s.races).toBe(1);
    expect(s.longestRunM).toBe(12000);
    expect(s.zoneSeconds).toEqual({ Z1: 706, Z4: 555 });
  });

  it('ignores missing/zero fields', () => {
    const s = weeklyStats([], [act({ distance: undefined, moving_time: undefined })], '2026-10-19');
    expect(s.actualDistanceM).toBe(0);
    expect(s.actualTimeSec).toBe(0);
    expect(s.longestRunM).toBe(0);
  });
});

describe('weeklyStats estimation (planned events with partial data)', () => {
  const W = '2026-10-19';

  it('estimates distance from moving_time × pace; real values unmarked', () => {
    const events = [
      // declared both → real, unmarked
      ev({ start_date_local: '2026-10-20T06:00:00', distance: 8000, moving_time: 2400 }),
      // declared time only → distance estimated at 5 min/km → 60min / 5 = 12km
      ev({ start_date_local: '2026-10-21T06:00:00', moving_time: 3600 }),
    ];
    const s = weeklyStats(events, [], W, { paceMinPerKm: 5 });
    expect(s.plannedDistanceM).toBeCloseTo(20000, 5);
    expect(s.plannedTimeSec).toBe(6000); // real time stays real
    expect(s.plannedDistanceEstimated).toBe(true);
    expect(s.plannedTimeEstimated).toBeUndefined();
  });

  it('estimates time from distance × pace in reverse; mixed weeks flag once', () => {
    const events = [
      ev({ start_date_local: '2026-10-20T06:00:00', distance: 10000 }), // no time → est 50min @5
      ev({ start_date_local: '2026-10-21T06:00:00', distance: 6000, moving_time: 1800 }), // real both
    ];
    const s = weeklyStats(events, [], W, { paceMinPerKm: 5 });
    expect(s.plannedTimeSec).toBe(4800); // 3000 + 1800
    expect(s.plannedDistanceM).toBe(16000);
    expect(s.plannedTimeEstimated).toBe(true);
    expect(s.plannedDistanceEstimated).toBeUndefined();
  });

  it('without pace (or with invalid pace) behaves exactly like before', () => {
    const events = [
      ev({ start_date_local: '2026-10-20T06:00:00', distance: 8000, moving_time: 2400 }),
      ev({ start_date_local: '2026-10-21T06:00:00', moving_time: 3600 }), // no distance, no estimate
    ];
    const legacy = weeklyStats(events, [], W);
    expect(legacy.plannedDistanceM).toBe(8000);
    expect(legacy.plannedTimeSec).toBe(6000);
    expect(legacy.plannedDistanceEstimated).toBeUndefined();
    expect(legacy.plannedTimeEstimated).toBeUndefined();

    const badPace = weeklyStats(events, [], W, { paceMinPerKm: 0 });
    expect(badPace.plannedDistanceM).toBe(8000);
    expect(badPace.plannedDistanceEstimated).toBeUndefined();
  });

  it('never fabricates load', () => {
    const events = [ev({ start_date_local: '2026-10-20T06:00:00', moving_time: 3600 })];
    const s = weeklyStats(events, [], W, { paceMinPerKm: 5 });
    expect(s.plannedLoad).toBe(0);
    expect(s.plannedDistanceM).toBeCloseTo(12000, 5);
  });

  it('skips events with neither distance nor time', () => {
    const events = [ev({ start_date_local: '2026-10-20T06:00:00', name: 'Rest' })];
    const s = weeklyStats(events, [], W, { paceMinPerKm: 5 });
    expect(s.plannedDistanceM).toBe(0);
    expect(s.plannedTimeSec).toBe(0);
    expect(s.plannedDistanceEstimated).toBeUndefined();
  });
});

describe('averagePaceMinPerKm', () => {
  it('prefers run-family activities when any qualify', () => {
    const acts = [
      act({ type: 'Run', distance: 10000, moving_time: 3000 }), // 5:00/km
      act({ type: 'Ride', distance: 40000, moving_time: 5400 }), // would dilute to ~3.6
    ];
    expect(averagePaceMinPerKm(acts)).toBeCloseTo(5, 5);
  });

  it('falls back to all activities when no runs qualify', () => {
    const acts = [
      act({ type: 'Ride', distance: 30000, moving_time: 3600 }), // 2:00/km
      act({ type: 'Walk', distance: 3000, moving_time: 1800 }), // 10:00/km
    ];
    // 5400s total / 33km = 2.7272... min/km
    expect(averagePaceMinPerKm(acts)).toBeCloseTo(5400 / 60 / 33, 5);
  });

  it('ignores activities missing time or distance → null when nothing qualifies', () => {
    expect(averagePaceMinPerKm([act({ distance: 5000 }), act({ moving_time: 1800 })])).toBeNull();
    expect(averagePaceMinPerKm([])).toBeNull();
  });
});

describe('form + wellnessSummary', () => {
  it('form = ctl − atl; null when missing', () => {
    expect(form({ id: '2026-10-24', ctl: 41.87, atl: 43.38 })).toBeCloseTo(-1.51, 5);
    expect(form({ id: 'x', ctl: 40, atl: undefined })).toBeNull();
    expect(form(undefined)).toBeNull();
  });

  it('averages over days', () => {
    const days: WellnessDay[] = [
      { id: '2026-10-23', ctl: 40, atl: 40, hrv: 60, restingHR: 50, sleepSecs: 28800 },
      { id: '2026-10-24', ctl: 42, atl: 44, hrv: 62, restingHR: 52, sleepSecs: 27360 },
    ];
    const s = wellnessSummary(days);
    expect(s.avgForm).toBeCloseTo(-1, 5);
    expect(s.avgHrv).toBe(61);
    expect(s.avgSleepHrs).toBeCloseTo(7.8, 3);
  });
});

describe('formatters', () => {
  it('formats durations', () => {
    expect(formatDuration(3660)).toBe('1h01m');
    expect(formatDuration(2935)).toBe('48m');
    expect(formatDuration(59)).toBe('1m');
  });
  it('formats pace', () => {
    expect(formatPace(3.7037)).toBe('3:42/km');
    expect(formatPace(4)).toBe('4:00/km');
  });
});
