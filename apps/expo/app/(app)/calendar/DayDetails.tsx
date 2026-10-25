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
import { formatDuration } from '@intervals/core';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Badge } from '@/components/ui';
import WorkoutTimeline from '@/components/WorkoutTimeline';
import MetricGrid from './MetricGrid';
import { timeLabel } from '@/lib/dates';
import {
  dominantZone,
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
      return <Badge label="MISSED" tone="danger" />;
    default:
      return <Badge label="PLANNED" tone="accent" />;
  }
}

/** Recorded session: metric grid + dominant-zone callout + zone-times bar. */
function RecordedBlock({ activity }: { activity: Activity }) {
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
      <MetricGrid metrics={recordedMetricCells(activity)} />
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
}: {
  cell: DayCell;
  today: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { events, activities } = cell;
  const loneActivities = activities.filter(
    (a) => !events.some((e) => e.id != null && e.id === a.paired_event_id),
  );

  if (events.length === 0 && loneActivities.length === 0) {
    return (
      <View style={s.restDay}>
        <Text style={s.restBadge}>Rest day</Text>
        <Text style={s.restText}>Nothing planned, nothing recorded.</Text>
      </View>
    );
  }

  return (
    <View style={s.wrap}>
      {events.map((e) => {
        const actual = activities.find((a) => a.paired_event_id === e.id);
        // V-05: visualize planned training sessions (WORKOUT / RACE_*);
        // notes/PLAN categories stay prose-only.
        const training =
          e.category == null || e.category === 'WORKOUT' || e.category.startsWith('RACE');
        return (
          <View key={`e${e.id ?? e.uid ?? e.start_date_local}`} style={s.block}>
            <View style={s.titleRow}>
              <Text style={s.name} numberOfLines={2}>
                {e.name ?? 'Planned workout'}
              </Text>
              <StatusBadge status={runStatus(e, actual ?? null, today)} category={e.category} />
            </View>
            <Text style={s.meta}>
              {[timeLabel(e.start_date_local), e.type].filter(Boolean).join(' · ')}
            </Text>
            {e.description && training ? <WorkoutTimeline description={e.description} /> : null}
            {e.description ? <Text style={s.description}>{e.description}</Text> : null}
            {actual ? <RecordedBlock activity={actual} /> : null}
          </View>
        );
      })}
      {loneActivities.map((a) => (
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
          <RecordedBlock activity={a} />
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
