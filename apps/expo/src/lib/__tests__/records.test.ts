import { describe, expect, it } from 'vitest';
import { activityLine, eventLine, zoneSecondsOf } from '../format';
import { toActivity, toEvent, toWellness } from '../records';

describe('toEvent (PB calendar_events row → EventEx)', () => {
  it('prefers mirror columns and falls back to the data json', () => {
    const e = toEvent({
      id: 'rec1',
      intervals_id: 123,
      uid: 'u-1',
      start_date_local: '2026-10-20T17:45:00',
      category: 'WORKOUT',
      type: 'Run',
      name: 'Run club',
      description: '10x1min',
      distance: 8118.611,
      moving_time: 2664,
      icu_training_load: 75,
      data: { name: 'ignored-upstream-name', icu_intensity: 22 },
    });
    expect(e).toMatchObject({
      id: 123,
      start_date_local: '2026-10-20T17:45:00',
      category: 'WORKOUT',
      name: 'Run club',
      distance: 8118.611,
      moving_time: 2664,
      icu_training_load: 75,
      icu_intensity: 22, // filled from data
    });
  });

  it('defaults category to WORKOUT and tolerates nulls', () => {
    const e = toEvent({ id: 'r', intervals_id: null, start_date_local: '2026-10-24T08:00:00' });
    expect(e.category).toBe('WORKOUT');
    expect(e.distance).toBeUndefined();
    expect(e.name).toBeUndefined();
  });
});

describe('toActivity (PB activities row → Activity)', () => {
  it('maps zone_times → icu_zone_times and keeps pairing', () => {
    const a = toActivity({
      id: 'rec9',
      intervals_id: 'i199756190',
      start_date_local: '2026-10-24T07:42:17',
      name: 'Morning Run',
      distance: 8431.38,
      moving_time: 2869,
      pace: 4.79,
      average_heartrate: 142,
      icu_training_load: 70,
      zone_times: [
        { id: 'Z1', secs: 600 },
        { id: 'Z2', secs: 1800 },
      ],
      paired_event_id: 123,
      source: 'COROS',
    });
    expect(a.id).toBe('i199756190');
    expect(a.icu_zone_times).toEqual([
      { id: 'Z1', secs: 600 },
      { id: 'Z2', secs: 1800 },
    ]);
    expect(a.paired_event_id).toBe(123);
    expect(a.pace).toBeCloseTo(4.79);
  });

  it('falls back to upstream data json for zone times', () => {
    const a = toActivity({
      id: 'r',
      intervals_id: 'i1',
      start_date_local: '2026-10-24T07:42:17',
      data: { icu_zone_times: [{ id: 'Z3', secs: 120 }] },
    });
    expect(a.icu_zone_times).toEqual([{ id: 'Z3', secs: 120 }]);
  });
});

describe('toWellness', () => {
  it('maps snake_case columns to WellnessDay fields', () => {
    const w = toWellness({
      id: 'r',
      date: '2026-10-24',
      ctl: 58.2,
      atl: 41.1,
      resting_hr: 48,
      hrv: 7.1,
      sleep_secs: 27_000,
    });
    expect(w).toMatchObject({
      id: '2026-10-24',
      ctl: 58.2,
      atl: 41.1,
      restingHR: 48,
      hrv: 7.1,
      sleepSecs: 27_000,
    });
    // form = ctl − atl (core convention) stays computable
    expect(w.ctl! - w.atl!).toBeCloseTo(17.1);
  });
});

describe('format helpers', () => {
  it('eventLine composes km · time · load and skips empties', () => {
    expect(eventLine({ start_date_local: '2026-10-20T17:45:00', name: 'x', distance: 8118.611, moving_time: 2664, icu_training_load: 75.4 })).toBe('8.1km · 44m · load 75');
    expect(eventLine({ start_date_local: '2026-10-22T06:00:00', moving_time: 2400 })).toBe('40m');
    expect(eventLine({ start_date_local: '2026-10-22T06:00:00' })).toBe('');
  });

  it('activityLine includes pace and hr when present', () => {
    expect(
      activityLine({
        id: 'i1',
        start_date_local: '2026-10-24T07:42:17',
        distance: 8431.38,
        moving_time: 2869,
        pace: 4.79,
        average_heartrate: 142.4,
        icu_training_load: 70,
      }),
    ).toBe('8.4km · 47m · 4:47/km · 142bpm · load 70');
  });

  it('zoneSecondsOf sums by zone id', () => {
    expect(
      zoneSecondsOf({
        id: 'i1',
        start_date_local: '2026-10-24T07:42:17',
        icu_zone_times: [
          { id: 'Z2', secs: 1800 },
          { id: 'Z2', secs: 300 },
          { id: 'Z4', secs: 60 },
        ],
      }),
    ).toEqual({ Z2: 2100, Z4: 60 });
  });
});
