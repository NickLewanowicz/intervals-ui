/**
 * iOS WidgetKit bridge (round 17): the widget extension decodes the snapshot
 * with a Swift Codable model whose property names must match the JSON keys
 * this side emits — a silent rename would blank the widgets. These tests pin
 * the wire contract + the fail-soft bridge wrapper (native module mocked).
 */
import { describe, expect, it, vi } from 'vitest';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import { buildWidgetSnapshot, type WidgetSnapshot } from '../widget-data';
import { writeIosWidgetSnapshot } from '../widget-ios';

vi.mock('react-native', () => ({ Platform: { OS: 'ios', select: (o: object) => o } }));

// the bridge module is resolved lazily on first call — swap it per test
const write = vi.fn<(json: string) => boolean>(() => true);
vi.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: () => ({ write: (json: string) => write(json), reload: () => undefined }),
}));

const T0 = new Date('2026-10-24T09:30:00');

const ev = (over: Partial<EventEx>): EventEx => ({
  id: 1,
  start_date_local: '2026-11-08T09:00:00',
  category: 'WORKOUT',
  type: 'Run',
  name: 'Easy 8',
  ...over,
});

const act = (over: Partial<Activity> = {}): Activity => ({
  id: 'i1',
  start_date_local: '2026-10-24T07:12:00',
  type: 'Run',
  name: 'Morning run',
  distance: 8300,
  moving_time: 2712,
  ...over,
});

const wl = (date: string, ctl: number | null, atl: number | null): WellnessDay => ({
  id: date,
  ctl,
  atl,
});

const sampleInput = {
  events: [ev({ id: 2, start_date_local: '2026-11-08T09:00:00', category: 'RACE_A', name: 'City 10K' })],
  activities: [act()],
  wellness: [
    wl('2026-10-24', 42.31, 55.2),
    wl('2026-10-23', 41.8, 51.0),
    wl('2026-10-17', 40.1, 49.5),
  ],
  now: T0,
};

describe('iOS widget wire contract (Swift Codable ↔ WidgetSnapshot JSON)', () => {
  it('top-level keys match the Swift WidgetSnapshot model', () => {
    const snap = buildWidgetSnapshot(sampleInput);
    expect(Object.keys(snap).sort()).toEqual(
      ['fitness', 'nextRace', 'today', 'upcoming', 'version', 'writtenAt'].sort(),
    );
    expect(snap.version).toBe(1);
  });

  it('nextRace keys match Swift NextRace + countdown rollover value types', () => {
    const snap = buildWidgetSnapshot(sampleInput);
    expect(Object.keys(snap.nextRace!).sort()).toEqual(['date', 'daysUntil', 'name', 'time'].sort());
    expect(snap.nextRace!.daysUntil).toBe(15); // whole-day number, not a date parse
  });

  it('upcoming entry keys match Swift UpcomingEntry', () => {
    const snap = buildWidgetSnapshot(sampleInput);
    for (const row of snap.upcoming) {
      expect(Object.keys(row).sort()).toEqual(
        ['date', 'day', 'done', 'dow', 'isRace', 'isToday', 'metric', 'name'].sort(),
      );
    }
  });

  it('fitness keys match Swift Fitness (incl. nullable deltas + series points)', () => {
    const snap = buildWidgetSnapshot(sampleInput);
    expect(Object.keys(snap.fitness!).sort()).toEqual(
      ['atl', 'atlDelta7', 'bandWord', 'ctl', 'ctlDelta7', 'form', 'series'].sort(),
    );
    for (const p of snap.fitness!.series) {
      expect(Object.keys(p).sort()).toEqual(['ctl', 'date'].sort());
    }
    expect(snap.fitness!.series).toHaveLength(14); // Swift bar chart slots on exactly 14
  });

  it('JSON.stringify output round-trips with no key renames (wire sample)', () => {
    const snap = buildWidgetSnapshot(sampleInput);
    const parsed = JSON.parse(JSON.stringify(snap)) as WidgetSnapshot;
    expect(parsed.nextRace?.name).toBe('City 10K');
    expect(parsed.fitness?.bandWord).toBeTypeOf('string');
    // the exact field paths the Swift decoder reads
    expect(parsed).toHaveProperty('writtenAt');
    expect(parsed).toHaveProperty('nextRace.daysUntil');
    expect(parsed).toHaveProperty('fitness.ctlDelta7');
    expect(parsed).toHaveProperty('fitness.series[0].ctl');
  });
});

describe('writeIosWidgetSnapshot bridge wrapper', () => {
  it('serializes the snapshot and forwards it to the native module', () => {
    write.mockClear().mockReturnValue(true);
    const snap = buildWidgetSnapshot(sampleInput);
    expect(writeIosWidgetSnapshot(snap)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(JSON.stringify(snap));
  });

  it('returns false (never throws) when the native write fails', () => {
    write.mockClear().mockImplementation(() => {
      throw new Error('bridge gone');
    });
    expect(writeIosWidgetSnapshot(buildWidgetSnapshot(sampleInput))).toBe(false);
    write.mockReturnValue(false);
    expect(writeIosWidgetSnapshot(buildWidgetSnapshot(sampleInput))).toBe(false);
  });
});
