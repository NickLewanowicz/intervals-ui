/**
 * DiffBar — the approval modal's visual metric diff (proposal-approval-v2
 * spec §1.2): one horizontal track per metric on a shared max(old,new)
 * scale. The old value renders as the filled segment; the delta renders as
 * a second segment — hatched red when removed, solid green when added. The
 * percent chip sits in the label row; color encodes direction only (a cut
 * is often the GOOD change — the verdict stays in the coach's summary at
 * the top). A metric on one side only renders as a full hatch (removed) or
 * a full solid (added) track. Copy + fractions come from the pure model
 * (@/lib/diff-bar-view on top of @intervals/core's diffBar).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DiffBarRowModel } from '@/lib/diff-bar-view';
import { fontSize, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** Diagonal stripe lefts for the removed-segment hatch (% of the segment). */
const HATCH_LEFTS = ['8%', '28%', '48%', '68%', '88%'] as const;

export default function DiffBar({ row }: { row: DiffBarRowModel }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { model } = row;
  // Segment widths as fractions of the track (flexGrow over a zero basis):
  // cut → solid = what remains, hatch = removed; add → solid = old value,
  // green = added delta. One-sided metrics collapse to a single segment.
  const solidFrac = model.direction === 1 ? model.oldFrac : model.newFrac;
  const removedFrac = model.direction === -1 ? model.oldFrac - model.newFrac : 0;
  const addedFrac = model.direction === 1 ? model.newFrac - model.oldFrac : 0;
  const tone =
    model.direction === 1 ? colors.success : model.direction === -1 ? colors.danger : colors.muted;

  return (
    <View
      style={s.wrap}
      accessibilityLabel={`${row.label}: was ${row.wasLabel}, now ${row.nowLabel}${
        row.deltaChip ? `, ${row.deltaChip}` : ''
      }`}
    >
      <View style={s.labelRow}>
        <Text style={s.label}>{row.label}</Text>
        {row.pctChip ? <Text style={[s.chip, { color: tone }]}>{row.pctChip}</Text> : null}
        {row.deltaChip ? (
          <Text style={[s.chip, s.deltaChip, { color: tone }]}>{row.deltaChip}</Text>
        ) : null}
      </View>
      <View style={s.track}>
        {solidFrac > 0 ? (
          <View style={[s.seg, { flexGrow: solidFrac, backgroundColor: colors.borderStrong }]} />
        ) : null}
        {removedFrac > 0 ? (
          <View style={[s.seg, s.removed, { flexGrow: removedFrac }]}>
            {HATCH_LEFTS.map((left) => (
              <View key={left} style={[s.hatchLine, { left }]} />
            ))}
          </View>
        ) : null}
        {addedFrac > 0 ? (
          <View style={[s.seg, { flexGrow: addedFrac, backgroundColor: colors.success }]} />
        ) : null}
      </View>
      <View style={s.captionRow}>
        <Text style={s.caption}>was {row.wasLabel}</Text>
        <Text style={s.captionArrow}>→</Text>
        <Text style={[s.caption, s.captionNow]}>now {row.nowLabel}</Text>
      </View>
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    label: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    chip: {
      fontSize: fontSize.tiny,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    deltaChip: { marginLeft: 'auto' },
    track: {
      flexDirection: 'row',
      height: 10,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
    },
    seg: { flexBasis: 0, height: '100%' },
    removed: { backgroundColor: 'transparent', overflow: 'hidden' as const },
    hatchLine: {
      position: 'absolute',
      top: '-35%',
      height: '170%',
      width: 2,
      backgroundColor: p.danger,
      transform: [{ rotate: '-28deg' }],
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.sm,
      flexWrap: 'wrap',
    },
    caption: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontVariant: ['tabular-nums'],
    },
    captionNow: { color: p.text, fontWeight: '600' },
    captionArrow: { color: p.muted, fontSize: fontSize.tiny },
  });
