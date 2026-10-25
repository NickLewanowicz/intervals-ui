/**
 * One-line summaries for calendar entries (pure, unit tested). Reuses the
 * core formatters so the app and the worker's digests agree.
 */
import { formatDuration, formatKm, formatPace } from '@intervals/core';
import type { Activity, EventEx } from '@intervals/core';

const clean = (parts: Array<string | undefined | null>): string =>
  parts.filter((p): p is string => !!p).join(' · ');

export function eventLine(e: EventEx): string {
  return clean([
    e.distance && e.distance > 0 ? formatKm(e.distance) : undefined,
    e.moving_time && e.moving_time > 0 ? formatDuration(e.moving_time) : undefined,
    e.icu_training_load ? `load ${Math.round(e.icu_training_load)}` : undefined,
  ]);
}

export function activityLine(a: Activity): string {
  return clean([
    a.distance && a.distance > 0 ? formatKm(a.distance) : undefined,
    a.moving_time && a.moving_time > 0 ? formatDuration(a.moving_time) : undefined,
    a.pace ? `${formatPace(a.pace)}` : undefined,
    a.average_heartrate ? `${Math.round(a.average_heartrate)}bpm` : undefined,
    a.icu_training_load ? `load ${Math.round(a.icu_training_load)}` : undefined,
  ]);
}

/** Zone seconds record from an activity's zone times. */
export function zoneSecondsOf(a: Activity): Record<string, number> {
  const out: Record<string, number> = {};
  for (const zt of a.icu_zone_times ?? []) out[zt.id] = (out[zt.id] ?? 0) + zt.secs;
  return out;
}

/**
 * Compact relative time for sync freshness: "just now", "5m ago", "2h ago",
 * "3d ago". Pure (now injectable, unit tested).
 */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'never';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'never';
  const diffMin = Math.floor(Math.max(0, now.getTime() - t) / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
