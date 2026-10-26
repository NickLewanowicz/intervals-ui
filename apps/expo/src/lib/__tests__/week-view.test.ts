import { describe, expect, it } from 'vitest';
import type { Activity, DayCell, EventEx } from '@intervals/core';
import {
  compactRollupText,
  compactStatCells,
  dayPills,
  dayRollup,
  dayRunModels,
  dominantZone,
  plannedDistanceTime,
  rollupChips,
  runCardModel,
  runStatus,
  typeTagOf,
} from '../week-view';

const ev = (over: Partial<EventEx> = {}): EventEx => ({
  start_date_local: '2026-10-20T06:15:00',
  ...over,
});

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'i1',
  start_date_local: '2026-10-20T06:15:00',
  ...over,
});

const TODAY = '2026-10-22';

describe('runStatus', () => {
  it('marks races over everything, then recorded, missed, planned', () => {
    expect(runStatus(ev({ category: 'RACE_A' }), act(), TODAY)).toBe('race');
    expect(runStatus(ev({ category: 'WORKOUT' }), act({ race: true }), TODAY)).toBe('race');
    expect(runStatus(ev(), act(), TODAY)).toBe('done');
    expect(runStatus(ev({ start_date_local: '2026-10-20T06:00:00' }), null, TODAY)).toBe('missed');
    expect(runStatus(ev({ start_date_local: '2026-10-23T06:00:00' }), null, TODAY)).toBe('planned');
    expect(runStatus(null, act(), TODAY)).toBe('done');
  });
});

describe('dominantZone', () => {
  it('picks the zone with the most seconds, ties to the cooler zone', () => {
    expect(dominantZone({ Z1: 600, Z2: 1800, Z5: 300 })).toBe('Z2');
    expect(dominantZone({ Z3: 900, Z4: 900 })).toBe('Z3');
    expect(dominantZone({ Z5: 0 })).toBeNull();
    expect(dominantZone({})).toBeNull();
  });
});

describe('typeTagOf', () => {
  it('tags confident names and skips the rest', () => {
    expect(typeTagOf('6x1k Intervals')).toBe('Intervals');
    expect(typeTagOf('Steady Tempo run')).toBe('Tempo');
    expect(typeTagOf('Long run 32km')).toBe('Long');
    expect(typeTagOf('Recovery jog')).toBe('Easy');
    expect(typeTagOf('Morning run')).toBeNull();
    expect(typeTagOf(null)).toBeNull();
  });
});

describe('plannedDistanceTime', () => {
  it('keeps declared values and estimates only the missing half', () => {
    // distance declared, time estimated at 5:00/km pace
    const a = plannedDistanceTime(ev({ distance: 10_000, moving_time: undefined }), 5);
    expect(a.distanceM).toEqual({ value: 10_000, estimated: false });
    expect(a.timeSec).toEqual({ value: 50 * 60, estimated: true });
    // time declared, distance estimated
    const b = plannedDistanceTime(ev({ moving_time: 3600 }), 6);
    expect(b.distanceM).toEqual({ value: 10_000, estimated: true });
    expect(b.timeSec).toEqual({ value: 3600, estimated: false });
    // no pace → no estimation, no fabrication
    const c = plannedDistanceTime(ev({ moving_time: 3600 }), null);
    expect(c.distanceM).toBeNull();
    expect(c.timeSec).toEqual({ value: 3600, estimated: false });
  });
});

describe('runCardModel', () => {
  it('builds actual metrics for a recorded session', () => {
    const m = runCardModel(
      ev({ id: 7, name: 'Easy 8', distance: 8000, moving_time: 2400, icu_training_load: 60 }),
      act({
        paired_event_id: 7,
        name: 'Easy 8',
        distance: 8800,
        moving_time: 2880,
        pace: 5.45,
        average_heartrate: 156.2,
        icu_training_load: 92,
        icu_zone_times: [
          { id: 'Z1', secs: 600 },
          { id: 'Z2', secs: 2280 },
        ],
      }),
      { today: TODAY },
    );
    expect(m.status).toBe('done');
    expect(m.zone).toBe('Z2');
    expect(m.start).toBe('06:15');
    expect(m.metrics.map((c) => `${c.label}=${c.value}`)).toEqual([
      'Distance=8.8km',
      'Time=48m',
      'Pace=5:27/km',
      'HR=156',
      'Load=92',
    ]);
  });

  it('builds planned metrics with ≈ flags and omits missing ones', () => {
    const m = runCardModel(
      ev({ id: 8, name: 'Tempo', start_date_local: '2026-10-23T06:15:00', moving_time: 3600, icu_training_load: 55 }),
      null,
      { today: TODAY, paceMinPerKm: 5 },
    );
    expect(m.status).toBe('planned');
    expect(m.metrics).toEqual([
      { id: 'distance', label: 'Distance', value: '12.0km', estimated: true },
      { id: 'time', label: 'Time', value: '1h00m', estimated: false },
      { id: 'load', label: 'Load', value: '55', estimated: undefined },
    ]);
  });

  it('labels past unrecorded sessions as missed and races as race', () => {
    expect(runCardModel(ev({ start_date_local: '2026-10-20T06:00:00' }), null, { today: TODAY }).status).toBe(
      'missed',
    );
    const race = runCardModel(ev({ category: 'RACE_B', name: 'City 10k' }), null, { today: TODAY });
    expect(race.status).toBe('race');
    expect(race.tag).toBeNull();
  });

  it('works for a lone activity without an event', () => {
    const m = runCardModel(null, act({ name: 'Evening jog', distance: 4200, moving_time: 1500 }), {
      today: TODAY,
    });
    expect(m.status).toBe('done');
    expect(m.title).toBe('Evening jog');
    expect(m.metrics.some((c) => c.id === 'distance')).toBe(true);
  });
});

describe('dayRunModels', () => {
  it('merges paired actuals and keeps lone activities separate', () => {
    const cell: DayCell = {
      date: '2026-10-20',
      events: [ev({ id: 7, name: 'Easy 8' })],
      activities: [act({ paired_event_id: 7, distance: 8800 }), act({ id: 'i2', name: 'Stride loss', distance: 2000 })],
    };
    const models = dayRunModels(cell, { today: TODAY });
    expect(models).toHaveLength(2);
    expect(models[0]!.status).toBe('done');
    expect(models[0]!.metrics.find((c) => c.id === 'distance')!.value).toBe('8.8km');
    expect(models[1]!.title).toBe('Stride loss');
  });
});

describe('dayRollup + rollupChips', () => {
  it('aggregates recorded actuals once per paired session', () => {
    const cell: DayCell = {
      date: '2026-10-20',
      events: [ev({ id: 7, icu_training_load: 60 })],
      activities: [act({ paired_event_id: 7, distance: 10_500, moving_time: 3000, icu_training_load: 108 })],
    };
    const r = dayRollup(cell);
    expect(r.rest).toBe(false);
    expect(r.count).toBe(1);
    expect(r.distanceM).toBe(10_500);
    expect(r.load).toBe(108);
    expect(rollupChips(r).map((c) => c.text)).toEqual(['1 run', '10.5km', 'load 108']);
  });

  it('uses planned targets (≈) for unrecorded events', () => {
    const cell: DayCell = {
      date: '2026-10-21',
      events: [
        ev({ id: 1, moving_time: 3600 }),
        ev({ id: 2, distance: 5000, icu_training_load: 40 }),
      ],
      activities: [],
    };
    const r = dayRollup(cell, { paceMinPerKm: 5 });
    expect(r.count).toBe(2);
    expect(r.distanceEstimated).toBe(true);
    const chips = rollupChips(r);
    expect(chips.find((c) => c.id === 'distance')).toEqual({
      id: 'distance',
      text: '17.0km',
      estimated: true,
    });
    expect(chips.find((c) => c.id === 'load')!.text).toBe('load 40');
  });

  it('falls back to a time chip when no distance is knowable', () => {
    const chips = rollupChips(
      dayRollup({ date: 'x', events: [ev({ moving_time: 3600 })], activities: [] }, { paceMinPerKm: null }),
    );
    expect(chips.map((c) => c.text)).toEqual(['1 run', '1h00m']);
  });

  it('is a rest day when nothing is planned or recorded', () => {
    const r = dayRollup({ date: '2026-10-20', events: [], activities: [] });
    expect(r.rest).toBe(true);
    expect(rollupChips(r)).toEqual([]);
  });
});

describe('compactRollupText (mobile header, calendar-week-mobile-spec §1)', () => {
  it('joins distance + bare load and drops the run count', () => {
    const r = dayRollup({
      date: '2026-10-20',
      events: [ev({ id: 7, icu_training_load: 60 })],
      activities: [act({ paired_event_id: 7, distance: 10_500, moving_time: 3000, icu_training_load: 108 })],
    });
    expect(compactRollupText(r)).toBe('10.5km · 108');
  });

  it('keeps ≈ on pace-estimated halves and omits zero load', () => {
    const r = dayRollup(
      { date: '2026-10-21', events: [ev({ id: 1, moving_time: 3600 })], activities: [] },
      { paceMinPerKm: 5 },
    );
    expect(compactRollupText(r)).toBe('≈12.0km');
  });

  it('falls back to time when no distance is knowable', () => {
    const r = dayRollup(
      { date: '2026-10-21', events: [ev({ id: 1, moving_time: 3600, icu_training_load: 42 })], activities: [] },
      { paceMinPerKm: null },
    );
    expect(compactRollupText(r)).toBe('1h00m · 42');
  });

  it('is null for a rest day (the header shows the rest line instead)', () => {
    expect(compactRollupText(dayRollup({ date: '2026-10-20', events: [], activities: [] }))).toBeNull();
  });
});

describe('compactStatCells (mobile run row line 2, spec §2)', () => {
  it('keeps distance/time/load and drops pace+hr (they stay in the detail sheet)', () => {
    const m = runCardModel(
      ev({ id: 7 }),
      act({
        paired_event_id: 7,
        distance: 8800,
        moving_time: 2880,
        pace: 5.45,
        average_heartrate: 156.2,
        icu_training_load: 92,
      }),
      { today: TODAY },
    );
    expect(compactStatCells(m.metrics).map((c) => c.id)).toEqual(['distance', 'time', 'load']);
  });

  it('preserves the estimated flag for the ≈ mark', () => {
    const m = runCardModel(
      ev({ id: 8, start_date_local: '2026-10-23T06:15:00', moving_time: 3600 }),
      null,
      { today: TODAY, paceMinPerKm: 5 },
    );
    expect(compactStatCells(m.metrics)).toEqual([
      { id: 'distance', label: 'Distance', value: '12.0km', estimated: true },
      { id: 'time', label: 'Time', value: '1h00m', estimated: false },
    ]);
  });
});

describe('dayPills', () => {
  it('marks recorded / planned / race / today per day', () => {
    const cells = new Map<string, DayCell>([
      ['2026-10-19', { date: '2026-10-19', events: [], activities: [act({ id: 'a' })] }],
      ['2026-10-20', { date: '2026-10-20', events: [ev({ id: 1 })], activities: [] }],
      ['2026-10-21', { date: '2026-10-21', events: [ev({ category: 'RACE_A' })], activities: [] }],
    ]);
    const pills = dayPills(
      ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'],
      (d) => cells.get(d),
      '2026-10-22',
    );
    expect(pills[0]).toMatchObject({ letter: 'M', recorded: true, planned: false, race: false });
    expect(pills[1]).toMatchObject({ letter: 'T', recorded: false, planned: true });
    expect(pills[2]).toMatchObject({ letter: 'W', race: true });
    expect(pills[3]).toMatchObject({ letter: 'T', isToday: true, recorded: false, planned: false });
  });
});
