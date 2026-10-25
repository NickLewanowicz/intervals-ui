/**
 * WorkoutTimeline — the visual for a structured workout description (the same
 * free-text intervals.icu parses server-side). One horizontal bar, segments
 * sized by the dominant metric (labeled "by distance"/"by time"), colored by
 * zone on the day-detail zone-bar scale (Z1 cool → Z7 hot); rep sections
 * repeat their on/off segments like intervals.icu's renderer when few. Below:
 * a legend grouped by section ("Main Set ×4") and the coach's prose notes.
 * Prose-only descriptions render nothing — the caller keeps its text blurb.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  planTimeline,
  type TimelineRow,
  type TimelineSegment,
} from '@/lib/workout-view';
import { fontSize, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function WorkoutTimeline({
  description,
  compact = false,
}: {
  description: string;
  /** Bar + metric label only — for tight surfaces (chat cards, rows). */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const plan = useMemo(() => planTimeline(description), [description]);
  if (!plan) return null;

  const metricLabel =
    plan.metric === 'distance' ? 'by distance' : 'by time';
  const totalLabel = plan.totalsLabel ? `≈ ${plan.totalsLabel}` : null;

  return (
    <View style={s.wrap}>
      <View style={s.headRow}>
        <Text style={s.metric}>{metricLabel}</Text>
        {totalLabel ? <Text style={s.total}>{totalLabel}</Text> : null}
      </View>
      <View
        style={[s.bar, compact && s.barCompact]}
        accessibilityLabel={`Workout timeline ${metricLabel}${totalLabel ? `, about ${plan.totalsLabel}` : ''}`}
      >
        {plan.segments.map((seg) => (
          <BarSegment key={seg.key} segment={seg} short={compact} />
        ))}
      </View>
      {!compact ? (
        <>
          {plan.groups.map((g) => (
            <View key={g.section} style={s.group}>
              <Text style={s.groupTitle}>
                {g.section}
                {g.reps != null && g.reps > 1 ? ` ×${g.reps}` : ''}
              </Text>
              {g.rows.map((row) => (
                <LegendRow key={row.key} row={row} />
              ))}
            </View>
          ))}
          {plan.hiddenRows > 0 ? (
            <Text style={s.more}>+{plan.hiddenRows} more steps</Text>
          ) : null}
          {plan.notes.length > 0 ? (
            <Text style={s.notes}>{plan.notes.join(' ')}</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function BarSegment({ segment, short }: { segment: TimelineSegment; short: boolean }) {
  const { colors } = useTheme();
  const start = segment.zoneStart;
  const end = segment.zoneEnd;
  const color =
    start === 0
      ? colors.muted // zone undetectable — honest gray, never a fake zone
      : colors.zones[(end ?? start) - 1]!; // ranges color by zoneEnd
  return (
    <View
      style={{
        flexGrow: Math.max(segment.weight, 1),
        minWidth: 2,
        backgroundColor: color,
        height: short ? 8 : 12,
      }}
    />
  );
}

/** Zone chip; zone ranges split the swatch between the two zone colors. */
function ZoneChip({ start, end }: { start: number; end: number }) {
  const { colors } = useTheme();
  if (start === 0) return <View style={[chip.swatch, { backgroundColor: colors.muted }]} />;
  if (start === end) return <View style={[chip.swatch, { backgroundColor: colors.zones[start - 1]! }]} />;
  return (
    <View style={[chip.swatch, chip.split]}>
      <View style={{ flexGrow: 1, backgroundColor: colors.zones[start - 1]! }} />
      <View style={{ flexGrow: 1, backgroundColor: colors.zones[end - 1]! }} />
    </View>
  );
}

function LegendRow({ row }: { row: TimelineRow }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const detail = [row.quantity, row.target].filter(Boolean).join(' · ');
  return (
    <View style={s.row}>
      <ZoneChip start={row.zoneStart} end={row.zoneEnd} />
      {row.label ? (
        <Text style={s.rowLabel} numberOfLines={1}>
          {row.label}
        </Text>
      ) : null}
      {detail ? (
        <Text style={s.rowDetail} numberOfLines={1}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const chip = StyleSheet.create({
  swatch: { width: 8, height: 8, borderRadius: 4 },
  split: { flexDirection: 'row', overflow: 'hidden' },
});

const styles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    headRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    metric: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    total: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    bar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
      gap: 1,
    },
    barCompact: { height: 8 },
    group: { gap: 3, marginTop: spacing.xs },
    groupTitle: {
      color: p.accentText,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowLabel: { color: p.text, fontSize: fontSize.small, flexShrink: 1 },
    rowDetail: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
      marginLeft: 'auto',
    },
    more: { color: p.muted, fontSize: fontSize.tiny },
    notes: {
      color: p.muted,
      fontSize: fontSize.small,
      lineHeight: 19,
      marginTop: spacing.xs,
    },
  });
