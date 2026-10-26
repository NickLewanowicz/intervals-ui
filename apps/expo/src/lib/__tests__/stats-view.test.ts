import { describe, expect, it } from 'vitest';
import type { Activity, EventEx, WellnessDay } from '@intervals/core';
import {
  buildVerdict,
  fmtHours,
  formRingModel,
  formTileModel,
  fitnessTiles,
  gapCopy,
  gapModel,
  recoveryTiles,
  recoveryTrend,
  signedInt,
  summaryTiles,
  tileHints,
  trendDir,
  weekHonesty,
  zoneFlagChips,
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

const WEEK = {
  plannedDistanceM: 48_200,
  plannedTimeSec: 23_400,
  plannedLoad: 266,
  actualDistanceM: 30_400,
  actualTimeSec: 14_400,
  actualLoad: 137,
  longestRunM: 21_100,
};

describe('signedInt / trendDir / fmtHours', () => {
  it('signs integers and picks directions', () => {
    expect(signedInt(-1.51)).toBe('-2');
    expect(signedInt(0.8)).toBe('+1');
    expect(signedInt(0)).toBe('0');
    expect(signedInt(-0.2)).toBe('0');
    expect(trendDir(1.2)).toBe('up');
    expect(trendDir(-1.2)).toBe('down');
    expect(trendDir(0.04)).toBe('flat');
    expect(trendDir(null)).toBe('flat');
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

  it('positive form keeps the explicit + sign (spec example: "Form +2")', () => {
    expect(buildVerdict({ ...TREND, form: 2.4 }, 137)).toBe(
      'Form +2, steady · hold-flat ≈ 307/wk, you\'re at 137',
    );
  });
});

describe('summaryTiles (design spec §2: big actual, muted planned sub-chip)', () => {
  it('actual value with planned sub, estimate marked with ≈', () => {
    const tiles = summaryTiles({
      ...WEEK,
      plannedDistanceEstimated: true,
    });
    expect(tiles.map((t) => t.id)).toEqual(['distance', 'time', 'load']);
    const dist = tiles[0]!;
    expect(dist.label).toBe('Distance');
    expect(dist.value).toBe('30.4km');
    expect(dist.sub).toEqual({ text: '≈48.2km', tone: 'neutral', planned: true });
    expect(tiles[1]!.value).toBe('4h00m');
    expect(tiles[1]!.sub!.text).toBe('6h30m');
    expect(tiles[2]!.value).toBe('137');
    expect(tiles[2]!.sub).toEqual({ text: '266', tone: 'neutral', planned: true });
  });

  it('zero actual reads as an em dash and zero planned drops the sub-chip', () => {
    const tiles = summaryTiles({ ...WEEK, actualLoad: 0, plannedLoad: 0, longestRunM: 0 });
    expect(tiles[2]!.value).toBe('—');
    expect(tiles[2]!.sub).toBeNull();
  });
});

describe('tileHints (definitions live in tooltips)', () => {
  it('carries the estimation + longest-run copy on distance, none when unneeded', () => {
    const hints = tileHints(WEEK);
    expect(hints.distance).toContain('Longest run this week: 21.1km');
    expect(hints.time).toBeNull();
    expect(hints.load).toContain('TRIMP');

    const est = tileHints({ ...WEEK, plannedDistanceEstimated: true, plannedTimeEstimated: true });
    expect(est.distance).toContain('estimated from planned time');
    expect(est.time).toContain('pace is estimated');
  });
});

describe('formRingModel / formTileModel (design spec §2 ring)', () => {
  it('maps the fresh/fatigued band onto a 0..1 sweep with tone', () => {
    expect(formRingModel(30)).toEqual({ fraction: 1, word: 'very fresh', tone: 'better' });
    expect(formRingModel(-30).fraction).toBe(0);
    expect(formRingModel(-31).fraction).toBe(0);
    expect(formRingModel(-1.51).fraction).toBeCloseTo(28.49 / 60, 5);
    expect(formRingModel(-1.51).word).toBe('neutral');
    expect(formRingModel(-40).tone).toBe('worse');
    expect(formRingModel(10).tone).toBe('better');
  });

  it('tile shows signed form + weekly direction chip; loading state is dots', () => {
    const t = formTileModel(TREND, false)!;
    expect(t.value).toBe('-2');
    expect(t.valueTone).toBe('neutral');
    expect(t.sub!.dir).toBe('flat'); // |0.8| < 1 → steady
    expect(t.sub!.text).toBe('neutral · steady');

    const down = formTileModel({ ...TREND, formDelta7: -2.4 }, false)!;
    expect(down.sub!.dir).toBe('down');
    expect(down.sub!.tone).toBe('worse');
    expect(down.sub!.text).toBe('neutral · -2/wk');

    expect(formTileModel(null, false)).toBeNull();
    expect(formTileModel(null, true)!.value).toBe('…');
  });
});

describe('fitnessTiles (CTL/ATL mini-tiles, no arrows)', () => {
  it('1dp values + weekly delta chips with training semantics', () => {
    const [ctl, atl] = fitnessTiles(TREND);
    expect(ctl!.value).toBe('41.9');
    expect(ctl!.sub!.text).toBe('0/wk'); // -0.4 rounds to 0 → signedInt keeps "0"
    expect(ctl!.sub!.tone).toBe('worse'); // small losses still count against fitness
    expect(atl!.value).toBe('43.4');
    expect(atl!.sub!.dir).toBe('down');
    expect(atl!.sub!.tone).toBe('better'); // fatigue falling is good
  });

  it('detraining flags the CTL tooltip, not exposed prose', () => {
    const [ctl] = fitnessTiles({ ...TREND, detraining: true });
    expect(ctl!.hint).toContain('detraining, not a taper');
    const [plain] = fitnessTiles(TREND);
    expect(plain!.hint).toContain('42-day');
  });
});

describe('gapCopy (design spec §4: three chips + tooltip definition)', () => {
  it('Hold-flat / You / Gap chips with tone; definition + projection in tooltip', () => {
    const g = gapModel(TREND, [38, 38], 266);
    const copy = gapCopy(g, 'Sun 25');
    expect(copy.chips.map((c) => c.label)).toEqual(['Hold-flat', 'You', 'Gap']);
    expect(copy.chips[0]!.value).toBe('307/wk');
    expect(copy.chips[1]!.value).toBe('266');
    expect(copy.chips[2]!.value).toBe('+41');
    expect(copy.chips[2]!.tone).toBe('neutral');
    expect(copy.tooltip[0]).toContain('Hold-flat = the weekly load');
    const joined = copy.tooltip.join(' ');
    expect(joined).toContain('By Sun 25 at this pace');
    expect(joined).toContain('(est)');
    expect(joined).not.toMatch(/→|▲|▼/);
  });

  it('over hold-flat colors the gap red; honesty notes land in the tooltip', () => {
    const over = gapModel(TREND, [], 320);
    const copy = gapCopy(over, 'Sun 25', { extraCount: 1, extraLoad: 30, missedCount: 1, missedLoad: 70 });
    expect(copy.chips[2]!.value).toBe('-13');
    expect(copy.chips[2]!.tone).toBe('worse');
    const joined = copy.tooltip.join(' ');
    expect(joined).toContain('30 load unplanned (1 extra run)');
    expect(joined).toContain('1 missed (70 load)');
  });
});

describe('zoneFlagChips (flagged chips, sentences inside tooltips)', () => {
  const zones = {
    lowPct: 15,
    modPct: 27,
    highPct: 59,
    totalSecs: 3600,
    lowFlag: 'red' as const,
    modFlag: 'red' as const,
    highFlag: 'red' as const,
    moderateTrap: true,
  };

  it('labels + tones from the flags; full sentences in details', () => {
    const chips = zoneFlagChips(zones, [], []);
    expect(chips.map((c) => c.label)).toEqual(['LOW 15%', 'MOD 27%', 'HIGH 59%']);
    expect(chips.map((c) => c.tone)).toEqual(['red', 'red', 'red']);
    expect(chips[0]!.detail).toContain('moderate-trap warning');
    expect(chips[1]!.detail).toContain('threshold-heavy');
    expect(chips[2]!.detail).toContain('2-quality-sessions ceiling');
  });

  it('healthy week → neutral chips with the population-optimum definitions', () => {
    const healthy = {
      lowPct: 80,
      modPct: 8,
      highPct: 12,
      totalSecs: 3600,
      lowFlag: 'healthy' as const,
      modFlag: 'healthy' as const,
      highFlag: 'healthy' as const,
      moderateTrap: false,
    };
    const chips = zoneFlagChips(healthy, [], []);
    expect(chips.map((c) => c.tone)).toEqual(['neutral', 'neutral', 'neutral']);
    expect(chips[0]!.detail).toContain('75-80%');
  });

  it('fence-rider callouts ride inside the LOW chip tooltip with the day label', () => {
    const riders = [{ id: 'a2', name: 'Tuesday tempo', z3Pct: 34 }];
    const acts = [act({ id: 'a2', name: 'Tuesday tempo', start_date_local: '2026-10-20T18:00:00' })];
    const chips = zoneFlagChips(zones, riders, acts);
    expect(chips[0]!.detail).toContain('"Tuesday tempo" sat in Z3 34%');
    expect(chips[0]!.detail).toContain('Tue');
  });
});

describe('recoveryTiles (mini-tiles with delta chips + flag tooltips)', () => {
  const days: WellnessDay[] = [
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `2026-10-${24 - i}`,
      hrv: 60,
      restingHR: 50,
      sleepSecs: 25200,
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      id: `2026-10-${17 - i}`,
      hrv: 58,
      restingHR: 52,
      sleepSecs: 23400,
    })),
  ];

  it('HRV/RHR/Sleep values with weekly delta chips', () => {
    const tiles = recoveryTiles(recoveryTrend(days));
    expect(tiles.map((t) => t.id)).toEqual(['hrv', 'rhr', 'sleep']);
    expect(tiles[0]!.value).toBe('60.0');
    expect(tiles[0]!.sub!.text).toBe('+2');
    expect(tiles[0]!.sub!.tone).toBe('better');
    expect(tiles[1]!.value).toBe('50');
    expect(tiles[1]!.sub!.tone).toBe('better'); // RHR falling is good
    expect(tiles[2]!.value).toBe('7h00m');
    expect(tiles[2]!.sub!.text).toBe('+1h');
  });

  it('persistent moves surface as tooltips, never prose', () => {
    const down = (vals: number[]): WellnessDay[] =>
      vals.map((v, i) => ({ id: `d${i}`, hrv: v, restingHR: 50 }));
    const tiles = recoveryTiles(recoveryTrend(down([58, 59, 60, 61, 62])));
    expect(tiles[0]!.hint).toContain('HRV down 3 days running');
    const calm = recoveryTiles(recoveryTrend(days));
    expect(calm[0]!.hint).toContain('7-day average');
  });

  it('empty mirror → no tiles', () => {
    expect(recoveryTiles(recoveryTrend([]))).toEqual([]);
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
