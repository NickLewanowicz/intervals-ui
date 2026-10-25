/**
 * Builds the coach's data digests from the PocketBase mirrors.
 * Pure functions — unit-tested; the LLM never sees raw JSON it doesn't need.
 *
 * ADR-0006: shared by the Worker chat handler AND the client's direct
 * chat path so both transports build identical prompts from the same
 * mirror rows.
 */
import { formatDuration, formatKm, formatPace, isRaceEvent, weekKey } from './stats';
import { formatPaceBand, trainingPaces, vdotFromPerformance } from './vdot';
import type { Activity, EventEx, SportSettings, WellnessDay } from './types';

export interface MirrorEvent extends Partial<EventEx> {
  intervals_id?: number;
}
export interface MirrorActivity extends Partial<Activity> {}
export interface MirrorWellness extends Partial<WellnessDay> {
  date?: string;
  resting_hr?: number | null;
  sleep_secs?: number | null;
}

const localDate = (s: string | undefined) => (s ?? '').slice(0, 10);

/** "Mon 10-20: #145969946 Run club · WORKOUT · planned 8.5km/40m load 50 · done 8.8km/48m load 92" */
export function calendarDigest(
  events: MirrorEvent[],
  activities: MirrorActivity[],
): string {
  const byDate = new Map<string, { events: MirrorEvent[]; activities: MirrorActivity[] }>();
  const bucket = (d: string) => {
    let b = byDate.get(d);
    if (!b) {
      b = { events: [], activities: [] };
      byDate.set(d, b);
    }
    return b;
  };
  for (const e of events) bucket(localDate(e.start_date_local)).events.push(e);
  for (const a of activities) bucket(localDate(a.start_date_local)).activities.push(a);

  const dates = [...byDate.keys()].sort();
  if (!dates.length) return '(calendar empty — no intervals.icu data synced yet)';

  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const weekTotals = new Map<
    string,
    { pd: number; pt: number; pl: number; ad: number; at: number; al: number }
  >();
  const bump = (week: string, kind: 'p' | 'a', d: number, t: number, l: number) => {
    const w = weekTotals.get(week) ?? { pd: 0, pt: 0, pl: 0, ad: 0, at: 0, al: 0 };
    if (kind === 'p') {
      w.pd += d;
      w.pt += t;
      w.pl += l;
    } else {
      w.ad += d;
      w.at += t;
      w.al += l;
    }
    weekTotals.set(week, w);
  };

  // Recent actual pace (min/km) — same estimator as weeklyStats, so the
  // coach's digest totals agree with the calendar's totals card.
  const paceSamples = activities
    .map((a) => (a.distance && a.moving_time ? a.moving_time / 60 / (a.distance / 1000) : null))
    .filter((v): v is number => typeof v === 'number' && v > 2 && v < 12);
  const avgPace = paceSamples.length
    ? paceSamples.reduce((a, b) => a + b, 0) / paceSamples.length
    : null;
  let plannedEstimated = false;

  const dayBlocks = dates.map((date) => {
    const { events, activities } = byDate.get(date)!;
    const week = weekKey(date);
    for (const e of events) {
      let d = num(e.distance);
      const t = num(e.moving_time);
      if (!d && t && avgPace) {
        d = (t / 60) / avgPace * 1000;
        plannedEstimated = true;
      }
      bump(week, 'p', d, t, num(e.icu_training_load));
    }
    for (const a of activities) {
      bump(week, 'a', num(a.distance), num(a.moving_time), num(a.icu_training_load));
    }
    const day = new Date(date + 'T12:00:00Z');
    const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.getUTCDay()];
    const lines = [`${dow} ${date.slice(5)}:`];
    for (const e of events) {
      const race = isRaceEvent(e as EventEx) ? 'RACE' : (e.category ?? 'WORKOUT');
      const planned = [
        e.distance ? formatKm(e.distance) : null,
        e.moving_time ? formatDuration(e.moving_time) : null,
      ]
        .filter(Boolean)
        .join('/');
      const done = activities.find(
        (a) => a.paired_event_id != null && a.paired_event_id === e.id,
      ) ?? activities.find((a) => localDate(a.start_date_local) === localDate(e.start_date_local));
      const doneStr = done
        ? ` · done ${done.distance ? formatKm(done.distance) : '?'}${done.moving_time ? '/' + formatDuration(done.moving_time) : ''}${done.icu_training_load ? ' load ' + Math.round(done.icu_training_load) : ''}`
        : '';
      lines.push(
        `  #${e.intervals_id ?? e.id} ${e.name ?? '(untitled)'} · ${race} · planned ${planned || '—'}${e.icu_training_load ? ' load ' + Math.round(e.icu_training_load) : ''}${doneStr}`,
      );
      if (e.description) lines.push(`    ${e.description.replace(/\n/g, ' | ').slice(0, 220)}`);
    }
    for (const a of activities) {
      const paired = events.some(
        (e) => (e.intervals_id ?? e.id) === a.paired_event_id,
      );
      if (paired) continue;
      lines.push(
        `  (unplanned) ${a.name ?? a.type ?? 'Activity'} · done ${a.distance ? formatKm(a.distance) : '?'}${a.moving_time ? '/' + formatDuration(a.moving_time) : ''}${a.icu_training_load ? ' load ' + Math.round(a.icu_training_load) : ''}${a.race ? ' [RACE]' : ''}`,
      );
    }
    if (lines.length === 1) lines.push('  (no entries)');
    return { week, text: lines.join('\n') };
  });

  // Insert a computed totals line after each Monday-week block — the model
  // must quote these, never re-sum (its own arithmetic drifts; see eval log).
  const out: string[] = [];
  let lastWeek = '';
  for (const block of dayBlocks) {
    if (lastWeek && block.week !== lastWeek) {
      const w = weekTotals.get(lastWeek);
      if (w) out.push(weekTotalsLine(lastWeek, w, plannedEstimated));
    }
    out.push(block.text);
    lastWeek = block.week;
  }
  const last = weekTotals.get(lastWeek);
  if (last) out.push(weekTotalsLine(lastWeek, last, plannedEstimated));
  return out.join('\n');
}

function weekTotalsLine(
  week: string,
  w: { pd: number; pt: number; pl: number; ad: number; at: number; al: number },
  estimated = false,
): string {
  const parts = [
    `WEEK OF ${week} TOTALS (computed — quote these, do not re-sum): planned ${estimated ? '≈' : ''}${formatKm(w.pd)}/${formatDuration(w.pt)}/load ${Math.round(w.pl)}`,
    `actual ${formatKm(w.ad)}/${formatDuration(w.at)}/load ${Math.round(w.al)}`,
  ];
  if (estimated) parts.push('(planned distance estimated from time at recent pace where plans declared time only)');
  return parts.join(' · ');
}

export function wellnessDigest(days: MirrorWellness[]): string {
  const recent = [...days].sort((a, b) => String(a.date ?? a.id).localeCompare(String(b.date ?? b.id))).slice(-7);
  if (!recent.length) return '(no wellness data synced)';
  const lines = recent.map((d) => {
    const f = d.ctl != null && d.atl != null ? d.ctl - d.atl : null;
    return [
      `${String(d.date ?? d.id).slice(5)}:`,
      f != null ? `form ${f >= 0 ? '+' : ''}${f.toFixed(0)}` : null,
      d.ctl != null ? `fitness ${d.ctl.toFixed(0)}` : null,
      d.atl != null ? `fatigue ${d.atl.toFixed(0)}` : null,
      d.hrv != null ? `hrv ${d.hrv.toFixed(0)}` : null,
      d.resting_hr != null ? `rhr ${d.resting_hr.toFixed(0)}` : null,
      d.sleep_secs != null ? `sleep ${(d.sleep_secs / 3600).toFixed(1)}h` : null,
    ]
      .filter(Boolean)
      .join(' ');
  });
  return lines.join('\n');
}

export function zonesDigest(settings: SportSettings[] | null | undefined): string {
  const run = (settings ?? []).find((s) => !s.type || s.type === 'Run') ?? (settings ?? [])[0];
  if (!run) return '(zone settings not synced)';
  const hr = run.hr_zones?.length
    ? `HR zones (bpm): ${run.hr_zone_names?.map((n, i) => `${n} <${run.hr_zones![i]}`).join(', ') ?? run.hr_zones.join('/')}`
    : null;
  const pace = run.threshold_pace
    ? `Threshold pace ${formatPace(run.threshold_pace)}/km; pace zones are % of it (${(run.pace_zone_names ?? ['Z1', 'Z2', 'Z3', 'Z4', 'Z5a', 'Z5b', 'Z5c']).join('/')})`
    : null;
  const lthr = run.lthr ? `LTHR ${run.lthr}bpm` : null;
  return [hr, pace, lthr].filter(Boolean).join('\n') || '(zone settings incomplete)';
}

/**
 * VDOT pace reference from the athlete's recent recorded races (last 90
 * days, best/highest VDOT wins; marked by intervals.icu with race=true or
 * sub_type RACE). Null when no race data — the prompt asks the coach to
 * estimate from threshold pace or ask instead.
 */
export function vdotDigest(activities: MirrorActivity[], now = new Date()): string | null {
  const candidates = activities.filter(
    (a) => a.race || a.sub_type === 'RACE',
  );
  let best: { vdot: number; name: string; date: string } | null = null;
  for (const a of candidates) {
    const d = localDate(a.start_date_local);
    const ageDays = (now.getTime() - new Date(d + 'T12:00:00Z').getTime()) / 86400_000;
    if (ageDays > 90 || ageDays < -1) continue;
    if (!a.distance || !a.moving_time) continue;
    const vdot = vdotFromPerformance(a.distance, a.moving_time);
    if (vdot == null) continue;
    if (!best || vdot > best.vdot) best = { vdot, name: a.name ?? 'Race', date: d };
  }
  if (!best) return null;
  const paces = trainingPaces(best.vdot);
  if (!paces) return null;
  const lines = [
    `Estimated VDOT ${best.vdot} (best recent race: ${best.name}, ${best.date}). Training paces (/km):`,
    `- Easy ${formatPaceBand(paces.easy)}`,
    `- Marathon ${formatPaceBand(paces.marathon)}`,
    `- Threshold ${formatPaceBand(paces.threshold)}`,
    `- Interval ${formatPaceBand(paces.interval)}`,
    `- Repetition ${formatPaceBand(paces.repetition)}`,
    `(Older or shorter race results give rougher estimates — treat as current-fitness anchor, recalibrated after each race.)`,
  ];
  return lines.join('\n');
}
