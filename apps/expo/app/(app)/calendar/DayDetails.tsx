/**
 * DayDetails — the day-detail content extracted from `app/(app)/calendar/
 * day.tsx` (week-view v2 spec §3) so the route, the desktop side panel and
 * the mobile sheet all render the SAME detail: each planned event with its
 * WorkoutTimeline + description, every recorded session as a labeled metric
 * grid (no dot-lines) + zone bar, and a quiet rest-day row when empty.
 *
 * Data arrives via the caller's DayCell (no fetching here): the calendar
 * screen already holds the week window; the day route loads [date, date].
 */
import { formatDuration, reconcileDay } from '@intervals/core';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import MetricGrid from './MetricGrid';
import { timeLabel } from '@/lib/dates';
import {
  dominantZone,
  plannedMetricCells,
  recordedMetricCells,
  runStatus,
  type RunStatus,
} from '@/lib/week-view';
import { zoneSecondsOf } from '@/lib/format';
import { fontSize, layout, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { Activity, DayCell, EventEx } from '@intervals/core';

function StatusBadge({ status, category }: { status: RunStatus; category?: string | null }) {
  switch (status) {
    case 'race':
      return <Badge label={`RACE ${category?.slice(5) ?? ''}`.trim()} tone="race" icon="flag" />;
    case 'done':
      return <Badge label="DONE" tone="success" icon="checkmark" />;
    case 'missed':
      // QA A2 acceptance: the past-and-never-done state reads "NOT DONE" —
      // reconciliation guarantees it never sits next to a same-day DONE row.
      return <Badge label="NOT DONE" tone="danger" />;
    default:
      return <Badge label="PLANNED" tone="accent" />;
  }
}

/** Recorded session: metric grid + dominant-zone callout + zone-times bar. */
function RecordedBlock({ activity, cols }: { activity: Activity; cols?: 2 | 3 | 4 }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const zoneSeconds = useMemo(() => zoneSecondsOf(activity), [activity]);
  const total = Object.values(zoneSeconds).reduce((a, b) => a + b, 0);
  const zones = Object.entries(zoneSeconds)
    .filter(([, secs]) => secs >= 60)
    .sort((a, b) => a[0].localeCompare(b[0]));
  const zone = dominantZone(zoneSeconds);

  return (
    <View style={s.actual}>
      <View style={s.actualHead}>
        <Text style={s.actualTitle}>Recorded</Text>
        {zone ? (
          <Text style={[s.actualZone, { color: zoneColor(colors, zone) }]}>mostly {zone}</Text>
        ) : null}
      </View>
      <MetricGrid metrics={recordedMetricCells(activity)} cols={cols} />
      {total > 0 ? (
        <>
          {/* FIX-4: proportional stacked bar, cool-to-hot by zone */}
          <View style={s.zoneBar}>
            {zones.map(([id, secs]) => (
              <View key={id} style={{ flexGrow: secs, backgroundColor: zoneColor(colors, id) }} />
            ))}
          </View>
          <View style={s.zoneLegend}>
            {zones.map(([id, secs]) => (
              <View key={id} style={s.zoneLegendItem}>
                <View style={[styles2.zoneSwatch, { backgroundColor: zoneColor(colors, id) }]} />
                <Text style={s.zoneLegendText}>
                  {id} {formatDuration(secs)}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

export default function DayDetails({
  cell,
  today,
  dense,
  paceMinPerKm,
}: {
  cell: DayCell;
  today: string;
  /**
   * Space-efficient expanded state (owner round 18): the mobile detail sheet
   * passes `dense` — recorded metrics render 3-across instead of the 2×N
   * grid, and the raw description block is skipped when the WorkoutTimeline
   * already renders the same text. Other surfaces keep the round-13 look.
   */
  dense?: boolean;
  /** Athlete pace (min/km) so planned targets keep their ≈ estimates (QA A3 parity with the run rows). */
  paceMinPerKm?: number | null;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  // Reconciled view (QA A2): an unpaired same-day activity merges onto its
  // planned event (one DONE entry, planned targets kept as the "Planned"
  // block) — a past event never renders NOT DONE next to a same-day DONE.
  const { events, lone } = useMemo(() => reconcileDay(cell), [cell]);

  if (events.length === 0 && lone.length === 0) {
    return (
      <View style={s.restDay}>
        <Text style={s.restBadge}>Rest day</Text>
        <Text style={s.restText}>Nothing planned, nothing recorded.</Text>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {events.map(({ event: e, actual }) => {
        // V-05: visualize planned training sessions (WORKOUT / RACE_*)
        // notes/PLAN categories stay prose-only.
        const training =
          e.category == null || e.category === 'WORKOUT' || e.category.startsWith('RACE');
        // QA A3: planned targets render here (distance/duration/load — the
        // same cells the run rows show), not just in the week list; on a
        // reconciled session the Planned grid sits above the Recorded block so
        // both values stay visible ("24.0 planned → 24.1 done"). Pure and
        // cheap — no memo inside the map (rules of hooks).
        const plannedCells = plannedMetricCells(e, paceMinPerKm ?? null);
        return (
          <View key={`e${e.id ?? e.uid ?? e.start_date_local}`} style={s.block}>
            <View style={s.titleRow}>
              <Text style={s.name} numberOfLines={2}>
                {e.name ?? 'Planned workout'}
              </Text>
              <StatusBadge status={runStatus(e, actual, today)} category={e.category} />
            </View>
            <Text style={s.meta}>
              {[timeLabel(e.start_date_local), e.type].filter(Boolean).join(' · ')}
            </Text>
            {plannedCells.length > 0 ? (
              <View style={s.actual}>
                <Text style={s.actualTitle}>Planned</Text>
                <MetricGrid metrics={plannedCells} cols={dense ? 3 : undefined} />
              </View>
            ) : null}
            {e.description && training ? <WorkoutTimeline description={e.description} /> : null}
            {e.description && !(dense && training) ? <Text style={s.description}>{e.description}</Text> : null}
            {actual ? <RecordedBlock activity={actual} cols={dense ? 3 : undefined} /> : null}
          </View>
        );
      })}
      {lone.map((a) => (
        <View key={`a${a.id}`} style={s.block}>
          <View style={s.titleRow}>
            <Text style={s.name} numberOfLines={2}>
              {a.name ?? 'Activity'}
            </Text>
            <Badge label="recorded" tone="success" icon="checkmark" />
          </View>
          <Text style={s.meta}>
            {[timeLabel(a.start_date_local), a.source].filter(Boolean).join(' · ')}
          </Text>
          <RecordedBlock activity={a} cols={dense ? 3 : undefined} />
        </View>
      ))}
    </View>
  );
}

const styles2 = StyleSheet.create({
  zoneSwatch: { width: 8, height: 8, borderRadius: 4 },
});

const styles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    block: { gap: spacing.xs + 1 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    name: { color: p.text, fontSize: fontSize.body + 1, fontWeight: '600', flexShrink: 1 },
    meta: { color: p.muted, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    description: {
      color: p.text,
      fontSize: fontSize.small + 1,
      lineHeight: 20,
      backgroundColor: p.bg,
      borderRadius: radius.md,
      padding: spacing.md,
      fontFamily: 'Menlo, monospace',
    },
    actual: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
      paddingTop: spacing.sm,
      gap: spacing.xs + 1,
    },
    actualHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    actualTitle: {
      color: p.accentText,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    actualZone: { fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase' },
    zoneBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
      gap: 1,
      marginTop: spacing.xs,
    },
    zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    zoneLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    zoneLegendText: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    restDay: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xl,
      minHeight: layout.minTouch,
    },
    restBadge: { color: p.muted, fontSize: fontSize.body, fontWeight: '700' },
    restText: { color: p.muted, fontSize: fontSize.small },
  });
