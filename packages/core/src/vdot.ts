/**
 * VDOT — Jack Daniels' performance-VO2max system, implemented from the
 * Daniels/Gilbert FORMULAS (not the copyrighted tables). Constants
 * cross-checked bit-for-bit across three open-source implementations
 * (CassioMaciel/Daniels_Running_Formula, tlgs/vdot, st3v/running-formulas-mcp)
 * — see docs/research/vdot-spec.md. Valid ≈ VDOT 30–85.
 *
 * Units matter: velocities are m/min (NOT m/s), times are minutes.
 */

const VO2_EQ = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;

/** Fraction of VO2max sustainable for t minutes. */
const PCT_MAX = (t: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

/** Velocity (m/min) producing a given absolute VO2. */
const velocityForVo2 = (vo2: number) =>
  (-0.182258 + Math.sqrt(0.182258 * 0.182258 + 4 * 0.000104 * (vo2 + 4.6))) /
  (2 * 0.000104);

export interface Performance {
  distanceM: number;
  timeS: number;
}

const MIN_VDOT = 30;
const MAX_VDOT = 85;

/** VDOT for a race performance. Returns null outside the model's validity. */
export function vdotFromPerformance(distanceM: number, timeS: number): number | null {
  if (!(distanceM > 0 && timeS > 0)) return null;
  const minutes = timeS / 60;
  const v = distanceM / minutes; // m/min
  const vdot = VO2_EQ(v) / PCT_MAX(minutes);
  if (!Number.isFinite(vdot)) return null;
  if (vdot < MIN_VDOT || vdot > MAX_VDOT) return null;
  return Math.round(vdot * 10) / 10;
}

/** Race time (seconds) for a distance at a given VDOT; null if out of range. */
export function timeFromVdot(vdot: number, distanceM: number): number | null {
  if (!(vdot >= MIN_VDOT && vdot <= MAX_VDOT) || !(distanceM > 0)) return null;
  let lo = 0.5; // minutes — absurdly fast
  let hi = 600; // minutes — absurdly slow
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const v = distanceM / mid;
    const implied = VO2_EQ(v) / PCT_MAX(mid);
    if (implied > vdot) lo = mid;
    else hi = mid;
  }
  return Math.round(((lo + hi) / 2) * 60 * 10) / 10; // seconds, 0.1s
}

/** Velocity (m/min) at a given % of VDOT (e.g. 0.86 for threshold band). */
function velocityAtPct(vdot: number, pct: number): number {
  return velocityForVo2(vdot * pct);
}

/** m/min → min/km, rounded to the second. */
const paceMinPerKm = (v: number) => Math.round(1000 / v * 100) / 100;

export interface PaceBand {
  minPace: number; // min/km (slower)
  maxPace: number; // min/km (faster)
}

export interface TrainingPaces {
  easy: PaceBand; // 59–74%
  marathon: PaceBand; // via marathon race-time inversion (M band 75–84%)
  threshold: PaceBand; // 83–88%
  interval: PaceBand; // 95–100%
  repetition: PaceBand; // 105–120%
}

export function trainingPaces(vdot: number): TrainingPaces | null {
  if (!(vdot >= MIN_VDOT && vdot <= MAX_VDOT)) return null;
  const band = (loPct: number, hiPct: number): PaceBand => ({
    minPace: paceMinPerKm(velocityAtPct(vdot, loPct)),
    maxPace: paceMinPerKm(velocityAtPct(vdot, hiPct)),
  });
  // Marathon pace: the pace you'd race a marathon at for this VDOT
  // (per spec: derived by marathon race-time inversion, not a fixed %).
  const marathonTimeS = timeFromVdot(vdot, 42195);
  let marathon: PaceBand;
  if (marathonTimeS) {
    const pace = marathonTimeS / (42195 / 1000) / 60; // min/km
    // ±2% band around the race-equivalent pace
    marathon = { minPace: Math.round(pace * 1.02 * 100) / 100, maxPace: Math.round(pace * 0.98 * 100) / 100 };
  } else {
    marathon = band(0.75, 0.8);
  }
  return {
    easy: band(0.59, 0.74),
    marathon,
    threshold: band(0.83, 0.88),
    interval: band(0.95, 1.0),
    repetition: band(1.05, 1.2),
  };
}

/** "4:24/km" formatting for a min/km float (shared style with stats.formatPace). */
export function formatPaceBand(band: PaceBand, unit: 'km' | 'mi' = 'km'): string {
  const fmt = (m: number) => {
    const whole = Math.floor(m);
    const secs = Math.round((m - whole) * 60);
    return `${whole}:${String(secs === 60 ? 0 : secs).padStart(2, '0')}`;
  };
  return `${fmt(band.maxPace)}–${fmt(band.minPace)}/${unit}`;
}
