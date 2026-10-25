/**
 * MetricGrid (week-view v2 spec §2) — the labeled micro-column grid that
 * replaces every dot-separated metric line: small-caps muted 10px labels over
 * tabular semibold values, 4-across (2×2 when the caller asks). Missing
 * metrics are omitted by the models, never dashed; pace-estimated values
 * keep their ≈ mark.
 */
import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import type { MetricCell } from '@/lib/week-view';
import { fontSize, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

export default function MetricGrid({
  metrics,
  cols,
  style,
}: {
  metrics: MetricCell[];
  /** Columns per row. Default: 4-across on wide viewports, 2×2 on phones
   *  (both shapes are in the spec; 4-across truncates values at 375). */
  cols?: 2 | 3 | 4;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width } = useWindowDimensions();
  const n = cols ?? (width < 768 ? 2 : 4);
  if (metrics.length === 0) return null;
  return (
    <View style={[s.grid, style]} accessibilityRole="text">
      {metrics.map((m) => (
        <View key={m.id} style={[s.cell, { flexBasis: `${Math.floor(100 / n)}%` }]}>
          <Text style={s.label} numberOfLines={1}>
            {m.label}
          </Text>
          <Text style={s.value} numberOfLines={1}>
            {m.estimated ? `≈ ${m.value}` : m.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
    cell: { flexGrow: 1, flexShrink: 1, minWidth: 0, paddingRight: 8 },
    label: {
      color: p.muted,
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    value: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
