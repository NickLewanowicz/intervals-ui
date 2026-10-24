/**
 * Builds the coach's data digests from the PocketBase mirrors.
 * Pure functions — unit-tested; the LLM never sees raw JSON it doesn't need.
 */
import { form, formatDuration, formatKm, formatPace, isRaceEvent } from '@intervals/core';
import type { EventEx, Activity, WellnessDay, SportSettings } from '@intervals/core';

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
  return dates
    .map((date) => {
      const { events, activities } = byDate.get(date)!;
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
        if (e.description) lines.push(`    ${e.description.replace(/\n/g, ' ⏎ ').slice(0, 220)}`);
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
      return lines.join('\n');
    })
    .join('\n');
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
