import { describe, expect, it } from 'vitest';
import {
  formatPaceBand,
  timeFromVdot,
  trainingPaces,
  vdotFromPerformance,
} from '../src/vdot';

describe('vdotFromPerformance', () => {
  // Verified fixtures from docs/research/vdot-spec.md (cross-checked against
  // CassioMaciel/Daniels_Running_Formula's README).
  it('matches the reference: 5K 27:00 → VDOT 34.96 ≈ 35.0', () => {
    expect(vdotFromPerformance(5000, 27 * 60)).toBeCloseTo(34.96, 1);
  });

  it('matches the reference: HM 1:29:10 → VDOT 51.5', () => {
    expect(vdotFromPerformance(21097.5, 89 * 60 + 10)).toBeCloseTo(51.5, 1);
  });

  it('marathon sanity vs Daniels table: 3:00 → ~53.5, 2:40 → ~61.5', () => {
    const v3h = vdotFromPerformance(42195, 3 * 3600)!;
    const v240 = vdotFromPerformance(42195, 2 * 3600 + 2400)!;
    expect(v3h).toBeCloseTo(53.5, 0);
    expect(v240).toBeCloseTo(61.5, 0);
  });

  it('rejects degenerate and out-of-range inputs', () => {
    expect(vdotFromPerformance(0, 0)).toBeNull();
    expect(vdotFromPerformance(5000, -1)).toBeNull();
    // 100m sprint → absurd extrapolation, outside 30–85
    expect(vdotFromPerformance(100, 11)).toBeNull();
  });
});

describe('timeFromVdot', () => {
  it('round-trips: HM 1:29:10 → vdot → time ≈ original', () => {
    const vdot = vdotFromPerformance(21097.5, 89 * 60 + 10)!;
    const time = timeFromVdot(vdot, 21097.5)!;
    expect(Math.abs(time - (89 * 60 + 10))).toBeLessThan(3);
  });

  it('predicts marathon from half-marathon fitness plausibly', () => {
    const vdot = vdotFromPerformance(21097.5, 89 * 60 + 10)!; // 51.5
    const marathon = timeFromVdot(vdot, 42195)!;
    const hours = marathon / 3600;
    // Daniels-equivalent marathon ≈ 2×HM + ~10-14 min → ~3:08-3:12
    expect(hours).toBeGreaterThan(3.0);
    expect(hours).toBeLessThan(3.25);
  });

  it('rejects out-of-range vdot', () => {
    expect(timeFromVdot(20, 5000)).toBeNull();
    expect(timeFromVdot(95, 5000)).toBeNull();
  });
});

describe('trainingPaces', () => {
  it('matches the spec worked example for VDOT 51.5 (HM 1:29:10)', () => {
    const p = trainingPaces(51.5)!;
    // Spec cross-checked: E 5:44–4:47, M ≈4:30 (race-time inversion; Daniels
    // table M for 51.5), T 4:21–4:09, I 3:54–3:44, R 3:36–3:14 (/km).
    // NOTE: minPace = slower end, maxPace = faster end.
    expect(p.easy.minPace).toBeCloseTo(5.73, 1);
    expect(p.easy.maxPace).toBeCloseTo(4.78, 1);
    expect(p.threshold.minPace).toBeCloseTo(4.35, 1);
    expect(p.threshold.maxPace).toBeCloseTo(4.15, 1);
    expect(p.interval.minPace).toBeCloseTo(3.9, 1);
    expect(p.repetition.minPace).toBeCloseTo(3.6, 1);
    expect(p.marathon.minPace).toBeGreaterThan(4.4);
    expect(p.marathon.maxPace).toBeLessThan(4.45);
  });

  it('paces order correctly (R < I < T < M < E)', () => {
    const p = trainingPaces(51.5)!;
    expect(p.repetition.minPace).toBeLessThan(p.interval.minPace);
    expect(p.interval.minPace).toBeLessThan(p.threshold.minPace);
    expect(p.threshold.minPace).toBeLessThan(p.marathon.minPace);
    expect(p.marathon.minPace).toBeLessThan(p.easy.minPace);
  });

  it('formats a band for display', () => {
    const p = trainingPaces(51.5)!;
    expect(formatPaceBand(p.marathon)).toMatch(/^\d+:\d{2}–\d+:\d{2}\/km$/);
  });

  it('rejects out-of-range vdot', () => {
    expect(trainingPaces(20)).toBeNull();
    expect(trainingPaces(90)).toBeNull();
  });
});
