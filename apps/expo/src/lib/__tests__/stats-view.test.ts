import { describe, expect, it } from 'vitest';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import {
  buildVerdict,
  fmtHours,
  gapLine,
  gapModel,
  recoveryTrend,
  signedInt,
  trendArrow,
  weekHonesty,
} from '../stats-view';

const ev = (over: Partial<EventEx>): EventEx => ({
  start_date_local: '2026-10-24T08:00:00',
  ...over,
});

const act = (over: Partial<Activity>): Activity => ({
  id: 'i1',
  start_date_local: '2026-10-24T08:00:00',
  ...over,
});

const rows = (pairs: Array<[string, number, number]>): WellnessDay[] =>
  pairs.map(([id, ctl, atl]) => ({ id, ctl, atl }));

const TREND = {
  date: '2026-10-24',
  ctl: 41.87,
  atl: 43.38,
  form: -1.51,
  ctlDelta7: -0.4,
  atlDelta7: -1.2,
  formDelta7: 0.8,
  band: 'neutral' as const,
  detraining: false,
};

describe('signedInt / trendArrow / fmtHours', () => {
  it('signs integers and picks arrows', () => {
    expect(signedInt(-1.51)).toBe('-2');
    expect(signedInt(0.8)).toBe('+1');
    expect(signedInt(0)).toBe('0');
    expect(signedInt(-0.2)).toBe('0');
    expect(trendArrow(1.2)).toBe('▲');
    expect(trendArrow(-1.2)).toBe('▼');
    expect(trendArrow(0.04)).toBe('→');
    expect(trendArrow(null)).toBe('→');
    expect(fmtHours(27000)).toBe('7h30m');
  });
});

describe('buildVerdict (spec §3 templates)', () => {
  it('state · load with the spec wording and integer form', () => {
    // planned week 266 at ctl 41.87/atl 43.38 → hold-flat 307
    expect(buildVerdict(TREND, 266)).toBe(
      'Form -2, steady · hold-flat ≈ 307/wk, you\'re at 266',
    );
  });

  it('without planned load the verdict is state-only; without trend → null', () => {
    expect(buildVerdict(TREND, 0)).toBe('Form -2, steady');
    expect(buildVerdict(null, 266)).toBeNull();
  });

  it('detraining overrides the state clause (spec §1.3)', () => {
    const t = { ...TREND, form: 2, detraining: true, ctlDelta7: -1.2 };
    expect(buildVerdict(t, 0)).toBe(
      'fresher, but fitness -1/wk — detraining, not a taper (est)',
    );
  });

  it('trend word follows the 7-day form delta', () => {
    expect(buildVerdict({ ...TREND, formDelta7: -2.4 }, 0)).toBe('Form -2, trending down');
    expect(buildVerdict({ ...TREND, formDelta7: 3 }, 0)).toBe('Form -2, trending up');
    expect(buildVerdict({ ...TREND, formDelta7: null }, 0)).toBe('Form -2, steady');
  });
});

describe('gapModel + gapLine (spec §2 card copy)', () => {
  it('quotes hold-flat vs planned with the projection (owner example shape)', () => {
    // live athlete: hold-flat 307/wk (44/day); planned 266 → 41 under;
    // remaining loads 38/day × 2 days
    const g = gapModel(TREND, [38, 38], 266);
    expect(g.holdWeekly).toBe(307);
    expect(g.holdDaily).toBe(44);
    expect(g.gapWeekly).toBe(41);
    expect(g.projected).toBe(true);
    const line = gapLine(g, 'Sun 25');
    expect(line).toContain('Hold-flat ≈ 307/wk (44/day)');
    expect(line).toContain('planned 266 → 41 under');
    expect(line).toContain('form -2 → ');
    expect(line).toContain('by Sun 25 (est)');
  });

  it('nothing planned says so; week over → no projection clause', () => {
    expect(gapLine(gapModel(TREND, [], 0), 'Sun 25')).toBe(
      'Hold-flat ≈ 307/wk (44/day) · nothing planned this week',
    );
    const over = gapModel(TREND, [], 320);
    expect(gapLine(over, 'Sun 25')).toBe(
      'Hold-flat ≈ 307/wk (44/day) · planned 320 → 13 over',
    );
  });
});

describe('weekHonesty (spec §1.1 buckets)', () => {
  it('extras (unpaired activities) and misses (past unpaired events) surface separately', () => {
    const events: EventEx[] = [
      ev({ id: 1, start_date_local: '2026-10-20T06:00:00', icu_training_load: 50 }), // done
      ev({ id: 2, start_date_local: '2026-10-21T06:00:00', icu_training_load: 70 }), // missed (past)
      ev({ id: 3, start_date_local: '2026-10-25T06:00:00', icu_training_load: 60 }), // future — not missed yet
      ev({ start_date_local: '2026-10-22T06:00:00', category: 'NOTE' }), // notes never count
    ];
    const activities: Activity[] = [
      act({ id: 'a1', start_date_local: '2026-10-20T07:00:00', paired_event_id: 1, icu_training_load: 55 }),
      act({ id: 'a2', start_date_local: '2026-10-23T07:00:00', icu_training_load: 30 }), // extra
    ];
    const h = weekHonesty(events, activities, '2026-10-19', '2026-10-24');
    expect(h.extraCount).toBe(1);
    expect(h.extraLoad).toBe(30);
    expect(h.missedCount).toBe(1);
    expect(h.missedLoad).toBe(70);
  });

  it('clean week → all zeros', () => {
    const h = weekHonesty(
      [ev({ id: 1, start_date_local: '2026-10-20T06:00:00' })],
      [act({ id: 'a1', start_date_local: '2026-10-20T07:00:00', paired_event_id: 1 })],
      '2026-10-19',
      '2026-10-24',
    );
    expect(h).toEqual({ extraCount: 0, extraLoad: 0, missedCount: 0, missedLoad: 0 });
  });
});

describe('recoveryTrend (spec §1.7: 7-day directions, persistent flags)', () => {
  it('7-day averages + delta vs prior 7', () => {
    const days: WellnessDay[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `2026-10-${24 - i}`,
        hrv: 60,
        restingHR: 50,
        sleepSecs: 25200, // 7h
      })),
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `2026-10-${17 - i}`,
        hrv: 58,
        restingHR: 52,
        sleepSecs: 23400, // 6h30
      })),
    ];
    const r = recoveryTrend(days);
    expect(r.any).toBe(true);
    expect(r.hrv.avg).toBe(60);
    expect(r.hrv.delta).toBeCloseTo(2, 5);
    expect(r.rhr.avg).toBe(50);
    expect(r.rhr.delta).toBeCloseTo(-2, 5);
    expect(r.sleep.avgSecs).toBe(25200);
    expect(r.sleep.deltaSecs).toBeCloseTo(1800, 5);
    expect(r.hrv.flag).toBe(false);
  });

  it('flags only persistent 3-day moves (HRV down, RHR up)', () => {
    const down = (vals: number[]): WellnessDay[] =>
      vals.map((v, i) => ({ id: `d${i}`, hrv: v, restingHR: 50 }));
    expect(recoveryTrend(down([58, 59, 60, 61, 62])).hrv.flag).toBe(true); // 3 straight down
    expect(recoveryTrend(down([60, 58, 60, 61, 62])).hrv.flag).toBe(false); // bounce
    const up = (vals: number[]): WellnessDay[] =>
      vals.map((v, i) => ({ id: `d${i}`, restingHR: v }));
    expect(recoveryTrend(up([52, 51, 50, 50, 50])).rhr.flag).toBe(true);
  });

  it('empty mirror → nothing to show', () => {
    expect(recoveryTrend([]).any).toBe(false);
  });
});
