import { describe, expect, it } from 'vitest';
import {
  activityDate,
  averagePaceMinPerKm,
  buildDayCells,
  ctlDriftPerWeek,
  ctlFlatWeeklyLoad,
  dailyPlannedLoads,
  eventDate,
  fenceRiders,
  fitnessTrend,
  formatDuration,
  formatPace,
  form,
  formBand,
  FORM_BAND_WORD,
  isRaceEvent,
  loadToFormZero,
  loadToHoldFlat,
  project,
  requiredDailyLoad,
  weeklyStats,
  weekKey,
  wellnessSummary,
  zoneBalance,
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

// ---------------------------------------------------------------------------
// Gap / load-needed math — fixtures from the metrics spec §2.7 (acceptance).
// ---------------------------------------------------------------------------

describe('gap math: closed-form identities (spec §2.2)', () => {
  it('cA(k) − cC(k) = 1 for every horizon', () => {
    for (const k of [1, 3, 7, 14, 28, 90]) {
      const ak = Math.pow(41 / 42, k);
      const bk = Math.pow(6 / 7, k);
      const cC = (1 - ak) / (ak - bk);
      expect(1 + cC - cC).toBeCloseTo(1, 12); // cA = 1 + cC (exact identity, float-safe)
      // and the spec table row for k=7:
      if (k === 7) {
        expect(ak).toBeCloseTo(0.844777, 5);
        expect(bk).toBeCloseTo(0.339917, 5);
        expect(cC).toBeCloseTo(0.30746, 4);
      }
    }
  });

  it('closed form agrees with day-by-day project() to <1e-3 (spec §2.7 invariants)', () => {
    for (const [c0, a0] of [[42, 45], [41.87, 43.38], [80, 60], [120, 150]] as const) {
      for (const target of [c0 - a0, 0, 10]) {
        const daily = requiredDailyLoad(c0, a0, 7, target);
        const loads = Array.from({ length: 7 }, () => daily);
        const p = project(c0, a0, loads);
        expect(p.form).toBeCloseTo(target, 3);
      }
    }
  });

  it('requiredDailyLoad(c, a, 7, 0) lands form7 in [−0.01, +0.01] over [10,150]', () => {
    for (let c = 10; c <= 150; c += 10) {
      for (let a = 10; a <= 150; a += 10) {
        const daily = requiredDailyLoad(c, a, 7, 0);
        const { form: form7 } = project(c, a, Array.from({ length: 7 }, () => daily));
        expect(form7).toBeGreaterThanOrEqual(-0.01);
        expect(form7).toBeLessThanOrEqual(0.01);
      }
    }
  });
});

describe('gap math: spec §2.7 acceptance fixtures', () => {
  it('CTL 42 / ATL 45 → hold-flat 321/wk, to-zero 280/wk, fitness-flat 294/wk', () => {
    expect(loadToHoldFlat(42, 45)).toBeCloseTo(321.4567, 2);
    expect(Math.round(loadToHoldFlat(42, 45))).toBe(321);
    expect(loadToFormZero(42, 45)).toBeCloseTo(279.8609, 2);
    expect(Math.round(loadToFormZero(42, 45))).toBe(280);
    expect(ctlFlatWeeklyLoad(42)).toBe(294);
    // recursion checks from the spec: form7 = −3.0000 exactly (hold), 0.0000 (to-zero)
    const hold = project(42, 45, Array.from({ length: 7 }, () => loadToHoldFlat(42, 45) / 7));
    expect(hold.form).toBeCloseTo(-3, 4);
    expect(hold.ctl).toBeCloseTo(42.61, 1); // fitness still rises while holding fatigue
    const zero = project(42, 45, Array.from({ length: 7 }, () => loadToFormZero(42, 45) / 7));
    expect(zero.form).toBeCloseTo(0, 4);
  });

  it('live athlete 2026-10-24 (ctl 41.87, atl 43.38) → hold 307/wk, to-zero 286/wk', () => {
    expect(Math.round(loadToHoldFlat(41.87, 43.38))).toBe(307);
    expect(Math.round(loadToFormZero(41.87, 43.38))).toBe(286);
    expect(Math.round(ctlFlatWeeklyLoad(41.87))).toBe(293);
    const hold = project(41.87, 43.38, Array.from({ length: 7 }, () => loadToHoldFlat(41.87, 43.38) / 7));
    expect(hold.form).toBeCloseTo(-1.51, 4);
  });

  it("the owner's example week: 266 planned (38/day) at CTL 42 → drift −0.62/wk, form → +1", () => {
    expect(ctlDriftPerWeek(38, 42)).toBeCloseTo(-0.62, 2);
    const p = project(42, 45, Array.from({ length: 7 }, () => 38));
    expect(p.ctl).toBeCloseTo(41.38, 1);
    expect(p.form).toBeCloseTo(1.0, 0);
    // round-trip from §2.5: 40/day at CTL 50 → −1.55/wk
    expect(ctlDriftPerWeek(40, 50)).toBeCloseTo(-1.55, 2);
  });

  it('dailyPlannedLoads buckets event load per weekday of the Mon-start week', () => {
    const events: EventEx[] = [
      { start_date_local: '2026-10-19T06:00:00', icu_training_load: 30 }, // Mon
      { start_date_local: '2026-10-22T06:00:00', icu_training_load: 50 }, // Thu
      { start_date_local: '2026-10-24T06:00:00', icu_training_load: 70 }, // Sat
      { start_date_local: '2026-10-27T06:00:00', icu_training_load: 99 }, // next week — out
    ];
    expect(dailyPlannedLoads(events, '2026-10-19')).toEqual([30, 0, 0, 50, 0, 70, 0]);
  });
});

describe('zoneBalance (spec §1.2)', () => {
  it('maps LOW=Z1+Z2, MOD=Z3+SS, HIGH=Z4–Z7 and thresholds flags', () => {
    // 5000+1500 low, 1000+500 mod, 800 high → total 8800
    const b = zoneBalance({ Z1: 5000, Z2: 1500, Z3: 1000, SS: 500, Z4: 800 });
    expect(b.lowPct).toBe(74); // 6500/8800 = 73.9%
    expect(b.modPct).toBe(17); // 1500/8800
    expect(b.highPct).toBe(9); // 800/8800
    expect(b.lowFlag).toBe('amber'); // 60–74
    expect(b.modFlag).toBe('amber'); // 10–20
    expect(b.highFlag).toBe('healthy');
    expect(b.moderateTrap).toBe(false);
  });

  it('flags the moderate trap below 60% low in a non-race week', () => {
    const b = zoneBalance({ Z1: 2000, Z2: 1000, Z3: 3000, Z4: 2000 });
    expect(b.lowPct).toBe(38);
    expect(b.lowFlag).toBe('red');
    expect(b.moderateTrap).toBe(true);
    // race week suppresses the trap flag (MP work is expected)
    expect(zoneBalance({ Z1: 2000, Z2: 1000, Z3: 3000, Z4: 2000 }, { raceWeek: true }).moderateTrap).toBe(false);
  });

  it('healthy 80/20 week and red high/mod weeks', () => {
    const healthy = zoneBalance({ Z1: 6000, Z2: 2000, Z3: 500, Z4: 500 });
    expect(healthy.lowFlag).toBe('healthy');
    expect(healthy.modFlag).toBe('healthy');
    expect(healthy.highFlag).toBe('healthy');
    expect(zoneBalance({ Z1: 1000, Z3: 500, Z5: 500 }).modFlag).toBe('red'); // MOD 25%
    expect(zoneBalance({ Z1: 1000, Z4: 500, Z5: 500 }).highFlag).toBe('red'); // HIGH 50%
  });

  it('zero zone time → all-zero shares, no trap', () => {
    const b = zoneBalance({});
    expect(b.totalSecs).toBe(0);
    expect(b.moderateTrap).toBe(false);
  });
});

describe('fenceRiders (spec §1.2 per-run flag)', () => {
  it('flags runs with >10% of zone time in Z3+SS, worst first', () => {
    const acts: Activity[] = [
      act({
        id: 'i1',
        name: 'Tue easy',
        icu_zone_times: [{ id: 'Z1', secs: 600 }, { id: 'Z3', secs: 200 }], // 25%
      }),
      act({
        id: 'i2',
        name: 'Wed reps',
        icu_zone_times: [{ id: 'Z1', secs: 900 }, { id: 'Z4', secs: 100 }], // Z4 ≠ Z3 — clean
      }),
      act({ id: 'i3', name: 'no zones' }),
    ];
    const riders = fenceRiders(acts);
    expect(riders).toHaveLength(1);
    expect(riders[0]).toMatchObject({ id: 'i1', name: 'Tue easy', z3Pct: 25 });
  });

  it('counts SS toward the moderate bucket', () => {
    const riders = fenceRiders([
      act({ id: 'i9', icu_zone_times: [{ id: 'Z2', secs: 850 }, { id: 'SS', secs: 150 }] }), // 15%
    ]);
    expect(riders[0]!.z3Pct).toBe(15);
  });
});

describe('fitnessTrend + formBand (spec §1.3/§1.4)', () => {
  const rows = (pairs: Array<[string, number, number]>): WellnessDay[] =>
    pairs.map(([id, ctl, atl]) => ({ id, ctl, atl }));

  it('trend = today − 7 rows ago, band per §1.4', () => {
    const days = rows([
      ['2026-10-24', 42, 45],
      ['2026-10-23', 42, 45],
      ['2026-10-22', 42, 45],
      ['2026-10-21', 42, 45],
      ['2026-10-20', 42, 45],
      ['2026-10-19', 42, 45],
      ['2026-10-18', 42, 45],
      ['2026-10-17', 42.6, 43.8], // 7 rows ago
    ]);
    const t = fitnessTrend(days)!;
    expect(t.ctlDelta7).toBeCloseTo(-0.6, 5);
    expect(t.atlDelta7).toBeCloseTo(1.2, 5);
    expect(t.formDelta7).toBeCloseTo(-1.8, 5);
    expect(t.form).toBe(-3);
    expect(t.band).toBe('neutral'); // −10…+5 = neutral band per §1.4
    expect(t.detraining).toBe(false);
  });

  it('flags detraining: ΔCTL7 ≤ −1 while form positive', () => {
    const days = rows([
      ['2026-10-24', 60, 50], // form +10 fresh
      ...Array.from({ length: 7 }, (_, i) => [`2026-10-${23 - i}`, 61.5, 50] as [string, number, number]),
    ]);
    const t = fitnessTrend(days)!;
    expect(t.ctlDelta7).toBeCloseTo(-1.5, 5);
    expect(t.form).toBeGreaterThan(0);
    expect(t.detraining).toBe(true);
  });

  it('null without a latest usable row; deltas null under 8 rows', () => {
    expect(fitnessTrend([])).toBeNull();
    expect(fitnessTrend([{ id: '2026-10-24' }])).toBeNull();
    const t = fitnessTrend(rows([['2026-10-24', 42, 45], ['2026-10-23', 42, 45]]))!;
    expect(t.ctlDelta7).toBeNull();
    expect(t.band).toBe('neutral');
  });

  it('form bands match the Coggan heuristics', () => {
    expect(formBand(30)).toBe('very-fresh');
    expect(formBand(10)).toBe('fresh');
    expect(formBand(0)).toBe('neutral');
    expect(formBand(-12)).toBe('fatigued');
    expect(formBand(-31)).toBe('deeply-fatigued');
    expect(FORM_BAND_WORD[formBand(-12)]).toBe('fatigued');
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
