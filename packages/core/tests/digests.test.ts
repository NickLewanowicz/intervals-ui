import { describe, expect, it } from 'vitest';
import { calendarDigest, vdotDigest, wellnessDigest, zonesDigest } from '../src/digests';

describe('calendarDigest', () => {
  it('renders planned vs done with ids the coach can reference', () => {
    const digest = calendarDigest(
      [
        {
          intervals_id: 145969946,
          start_date_local: '2026-10-20T17:45:00',
          name: 'Run club',
          category: 'WORKOUT',
          distance: 8481.9,
          moving_time: 2827,
          icu_training_load: 52,
          description: 'Warmup\n- 1.5km Z2 Pace',
        },
        {
          intervals_id: 147702963,
          start_date_local: '2026-10-27T17:45:00',
          name: 'Marathon',
          category: 'RACE_A',
          distance: 42195,
        },
      ],
      [
        {
          id: 'i199756190',
          start_date_local: '2026-10-20T17:47:53',
          paired_event_id: 145969946,
          distance: 8823.4,
          moving_time: 2935,
          icu_training_load: 92,
        },
      ],
    );
    expect(digest).toContain('Tue 10-20:');
    expect(digest).toContain('Tue 10-27:');
    expect(digest).toContain('#145969946 Run club · WORKOUT · planned 8.5km/47m load 52');
    expect(digest).toContain('done 8.8km/48m load 92');
    expect(digest).toContain('#147702963 Marathon · RACE');
    expect(digest).toContain('- 1.5km Z2 Pace');
  });

  it('flags unplanned activities', () => {
    const digest = calendarDigest(
      [{ intervals_id: 1, start_date_local: '2026-10-20T06:00:00', name: 'Easy' }],
      [
        {
          id: 'i2',
          start_date_local: '2026-10-21T06:00:00',
          distance: 5000,
          moving_time: 1800,
          race: true,
        },
      ],
    );
    expect(digest).toContain('(unplanned)');
    expect(digest).toContain('[RACE]');
  });

  it('reconciles an unpaired same-day activity into its event (QA A2, Noor case)', () => {
    const digest = calendarDigest(
      [
        {
          intervals_id: 146000001,
          start_date_local: '2026-10-24T08:00:00',
          name: 'Aerobic maintenance',
          category: 'WORKOUT',
          // plans often declare time only
          distance: 0,
          moving_time: 3000,
          icu_training_load: 49,
        },
      ],
      [
        {
          id: 'i1',
          start_date_local: '2026-10-24T07:42:17',
          // no paired_event_id — the ghost-MISSED trigger
          distance: 8431,
          moving_time: 2869,
          icu_training_load: 70,
        },
      ],
    );
    // ONE reconciled line: planned targets + done actuals together...
    expect(digest).toContain('#146000001 Aerobic maintenance · WORKOUT · planned 50m load 49 · done 8.4km/47m load 70');
    // ...and the same session never re-listed as a separate unplanned entry
    expect(digest).not.toContain('(unplanned)');
    // week totals carry the session once per column — planned load 49, actual
    // 8.4km/load 70 (planned distance pace-estimated from the sole activity)
    expect(digest).toContain('planned ≈8.8km/50m/load 49');
    expect(digest).toContain('actual 8.4km/47m/load 70');
  });

  it('keeps an activity with no same-day event as its own unplanned entry', () => {
    const digest = calendarDigest(
      [],
      [{ id: 'i2', start_date_local: '2026-10-19T18:17:50', distance: 3977, moving_time: 1168 }],
    );
    expect(digest).toContain('(unplanned)');
  });

  it('handles the empty mirror', () => {
    expect(calendarDigest([], [])).toContain('calendar empty');
  });
});

describe('wellnessDigest', () => {
  it('renders recent days with computed form', () => {
    const digest = wellnessDigest([
      { date: '2026-10-23', ctl: 40, atl: 38, hrv: 60, resting_hr: 50, sleep_secs: 28800 },
      { date: '2026-10-24', ctl: 42, atl: 44, hrv: 61, resting_hr: 51, sleep_secs: 27360 },
    ]);
    expect(digest).toContain('10-23: form +2');
    expect(digest).toContain('10-24: form -2');
    expect(digest).toContain('hrv 61');
    expect(digest).toContain('sleep 7.6h');
  });

  it('skips empty input', () => {
    expect(wellnessDigest([])).toContain('no wellness data');
  });
});

describe('zonesDigest', () => {
  it('prefers the Run settings and formats thresholds', () => {
    const digest = zonesDigest([
      {
        type: 'Run',
        lthr: 180,
        hr_zones: [143, 162, 171, 183, 190, 203],
        hr_zone_names: ['Recovery', 'Aerobic', 'Tempo', 'Threshold', 'Aerobic Endurance', 'Anaerobic Power'],
        threshold_pace: 3.7037,
        pace_zones: [77.5, 87.7, 94.3, 100, 103.4, 111.5, 999],
        pace_zone_names: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5a', 'Zone 5b', 'Zone 5c'],
      },
    ]);
    expect(digest).toContain('Threshold pace 3:42/km');
    expect(digest).toContain('LTHR 180bpm');
    expect(digest).toContain('Recovery <143');
  });

  it('degrades without data', () => {
    expect(zonesDigest(null)).toContain('not synced');
    expect(zonesDigest([])).toContain('not synced');
  });
});

describe('vdotDigest', () => {
  it('computes from the best recent race and renders pace bands', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    const digest = vdotDigest(
      [
        {
          start_date_local: '2026-09-20T09:00:00',
          race: true,
          name: 'Half marathon',
          distance: 21097.5,
          moving_time: 89 * 60 + 10,
        },
        {
          start_date_local: '2026-10-11T09:00:00',
          race: true,
          name: 'Marathon',
          distance: 42195,
          moving_time: 3 * 3600 + 49 * 60,
        },
      ],
      now,
    );
    expect(digest).toContain('VDOT 51.5');
    expect(digest).toContain('Half marathon, 2026-09-20');
    expect(digest).toContain('Easy 4:47–5:44/km');
    expect(digest).toContain('Threshold 4:09–4:21/km');
  });

  it('ignores stale races and non-races', () => {
    const now = new Date('2026-10-24T12:00:00Z');
    expect(
      vdotDigest(
        [{ start_date_local: '2026-01-10T09:00:00', race: true, distance: 21097.5, moving_time: 5340 }],
        now,
      ),
    ).toBeNull();
    expect(
      vdotDigest(
        [{ start_date_local: '2026-10-20T09:00:00', distance: 8823, moving_time: 2935 }],
        now,
      ),
    ).toBeNull();
  });
});
