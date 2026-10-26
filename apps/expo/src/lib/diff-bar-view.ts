/**
 * View-model for the approval modal's DiffBar rows (proposal-approval-v2
 * spec §1.2): maps raw old/new metric values through @intervals/core's
 * diffBar model into the display copy — small-caps label, signed percent
 * chip, signed delta chip, and the was/now captions. Pure + unit tested;
 * the DiffBar component only renders widths/colors from the model.
 */
import { diffBar, formatDuration, formatKm, type DiffBarModel } from '@intervals/core';
import { formatStepDuration } from '@/lib/workout-view';

export type DiffMetricKey = 'distance' | 'duration';

const LABELS: Record<DiffMetricKey, string> = { distance: 'Distance', duration: 'Duration' };

/** Typographic minus — matches the spec's "−2.4km" chip copy. */
const MINUS = '−';

function fmtMetric(key: DiffMetricKey, v: number): string {
  return key === 'distance' ? formatKm(v) : formatDuration(v);
}

/** Deltas need second granularity (formatDuration floors "30s" to "1m"). */
function fmtDelta(key: DiffMetricKey, v: number): string {
  return key === 'distance' ? formatKm(v) : formatStepDuration(v);
}

export interface DiffBarRowModel {
  key: DiffMetricKey;
  /** Small-caps track label ("Distance" — uppercased by style). */
  label: string;
  /** Shared-scale geometry from @intervals/core. */
  model: DiffBarModel;
  /** Signed percent chip for the label row ("−27%"); null when unknown/0. */
  pctChip: string | null;
  /** Signed chip on the delta segment ("−3.0km"/"+3.0km"); null when unchanged. */
  deltaChip: string | null;
  /** Old-value caption; "—" when the metric had no old value. */
  wasLabel: string;
  /** New-value caption; "—" when the proposal removes the metric. */
  nowLabel: string;
}

/**
 * One metric's diff-bar row model, or null when the metric is unset on both
 * sides (nothing to draw). Null/0/undefined all mean "unset" — same rule as
 * core's diffBar.
 */
export function diffBarRow(
  key: DiffMetricKey,
  oldV: number | null | undefined,
  newV: number | null | undefined,
): DiffBarRowModel | null {
  const model = diffBar(oldV, newV);
  if (!model) return null;
  const oldVal = typeof oldV === 'number' && Number.isFinite(oldV) && oldV > 0 ? oldV : null;
  const newVal = typeof newV === 'number' && Number.isFinite(newV) && newV > 0 ? newV : null;
  const pctChip =
    model.deltaPct == null || model.deltaPct === 0
      ? null
      : `${model.deltaPct > 0 ? '+' : MINUS}${Math.abs(model.deltaPct)}%`;
  const deltaChip =
    model.direction === 0
      ? null
      : `${model.direction === 1 ? '+' : MINUS}${fmtDelta(key, Math.abs((newVal ?? 0) - (oldVal ?? 0)))}`;
  return {
    key,
    label: LABELS[key],
    model,
    pctChip,
    deltaChip,
    wasLabel: oldVal != null ? fmtMetric(key, oldVal) : '—',
    nowLabel: newVal != null ? fmtMetric(key, newVal) : '—',
  };
}
