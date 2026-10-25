/**
 * Week view v2 building blocks (design spec docs/design/calendar-week-v2-spec.md):
 * - DayStrip: seven Mon–Sun pills (weekday letter + date number + status
 *   markers; today = filled, selected = tinted). Tap selects + scrolls.
 * - DayCard: titled day block inside the week sheet — header row (weekday +
 *   date, rollup chips or a Rest-day pill) over run cards / a quiet rest row.
 * - RunCard: intensity accent edge (dominant-zone color when recorded,
 *   outlined accent when planned), title + status chip (DONE/PLANNED/MISSED/
 *   RACE), and a labeled MetricGrid — never a dot-separated line.
 * - RunList: the day's run cards (or rest row), shared with the month
 *   selection panel.
 *
 * Pure models come from @/lib/week-view; data plumbing is unchanged.
 */
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DayCell } from '@intervals/core';
import { Badge } from '@/components/ui';
import { PressableScale } from '@/components/motion';
import MetricGrid from './MetricGrid';
import {
  dayPills,
  dayRollup,
  dayRunModels,
  rollupChips,
  type DayPillModel,
  type RollupChip,
  type RunCardModel,
  type RunStatus,
} from '@/lib/week-view';
import { fontSize, layout, pageSpacing, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import { weekdayIndex } from '@/lib/dates';

const WEEKDAY_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/** "Tuesday 20" — the DayCard header title. */
export function longDayLabel(date: string): string {
  return `${WEEKDAY_LONG[weekdayIndex(date)]} ${Number(date.slice(8, 10))}`;
}

// ---------------------------------------------------------------------------
// DayStrip
// ---------------------------------------------------------------------------

export function DayStrip({
  dates,
  cellOf,
  today,
  selected,
  onSelect,
}: {
  dates: string[];
  cellOf: (date: string) => DayCell | undefined;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const pills: DayPillModel[] = dayPills(dates, cellOf, today);
  return (
    <View style={s.strip} testID="day-strip" accessibilityRole="tablist">
      {pills.map((p) => {
        const isSel = selected === p.date;
        const filled = p.isToday || isSel;
        return (
          <PressableScale
            key={p.date}
            onPress={() => onSelect(p.date)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={`Select ${longDayLabel(p.date)}${p.isToday ? ', today' : ''}`}
            style={[
              s.pill,
              p.isToday && s.pillToday,
              isSel && !p.isToday && s.pillSelected,
            ]}
          >
            <Text style={[s.pillLetter, filled && { color: p.isToday ? colors.onAccent : colors.accentText }]}>
              {p.letter}
            </Text>
            <Text style={[s.pillNum, filled && { color: p.isToday ? colors.onAccent : colors.accentText }]}>
              {p.dayNum}
            </Text>
            <View style={s.pillMarkers}>
              {p.recorded ? <View style={[s.marker, { backgroundColor: colors.success }]} /> : null}
              {p.planned ? <View style={[s.marker, s.markerPlan, { borderColor: colors.accentText }]} /> : null}
              {p.race ? <View style={[s.marker, { backgroundColor: colors.race }]} /> : null}
            </View>
          </PressableScale>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Status chip + run card
// ---------------------------------------------------------------------------

function StatusChip({ status, category }: { status: RunStatus; category?: string | null }) {
  const { colors } = useTheme();
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

/** Tag chip (Tempo/Easy/…) — quiet outline, skips when the model has none. */
function TagChip({ tag }: { tag: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.tagChip}>
      <Text style={s.tagText}>{tag}</Text>
    </View>
  );
}

export function RunCard({
  model,
  category,
  onPress,
  style,
}: {
  model: RunCardModel;
  /** Event category (for the RACE A/B/C chip label) when the run comes from an event. */
  category?: string | null;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  // Intensity accent edge (spec §2): recorded = solid dominant-zone color;
  // planned = outlined accent; missed = ghosted muted; race recorded without
  // zone data falls back to the race token.
  const edge =
    model.status === 'planned' || model.status === 'missed'
      ? model.status === 'planned'
        ? [s.edgePlanned, { borderColor: colors.accentText, backgroundColor: colors.accentSoft }]
        : [s.edge, { backgroundColor: colors.borderStrong }]
      : [
          s.edge,
          {
            backgroundColor: model.zone
              ? zoneColor(colors, model.zone)
              : model.status === 'race'
                ? colors.race
                : colors.muted,
          },
        ];
  return (
    <PressableScale
      onPress={onPress}
      style={[s.runCard, style]}
      accessibilityLabel={`Open ${model.title} details`}
    >
      <View style={edge as StyleProp<ViewStyle>} />
      <View style={s.runBody}>
        <View style={s.runTitleRow}>
          {model.start ? <Text style={s.runStart}>{model.start}</Text> : null}
          <Text style={s.runName} numberOfLines={1}>
            {model.title}
          </Text>
          {model.tag ? <TagChip tag={model.tag} /> : null}
          <View style={s.spring} />
          <StatusChip status={model.status} category={category} />
        </View>
        <MetricGrid metrics={model.metrics} />
      </View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// RunList (day body; shared with the month selection panel)
// ---------------------------------------------------------------------------

export function RunList({
  cell,
  today,
  paceMinPerKm,
  onPressRun,
}: {
  cell: DayCell;
  today: string;
  paceMinPerKm?: number | null;
  onPressRun?: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const models = dayRunModels(cell, { today, paceMinPerKm });
  if (models.length === 0) {
    return (
      <View style={s.restRow}>
        <Ionicons name="moon-outline" size={14} color={colors.muted} />
        <Text style={s.restText}>Rest day</Text>
      </View>
    );
  }
  return (
    <View style={s.runList}>
      {models.map((m) => {
        const race = cell.events.find((e) => m.key === `e${e.id ?? e.uid ?? e.start_date_local}`);
        return (
          <RunCard key={m.key} model={m} onPress={onPressRun} category={race?.category} />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// DayCard
// ---------------------------------------------------------------------------

function RollupChips({ chips }: { chips: RollupChip[] }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.rollupRow}>
      {chips.map((c) => (
        <View key={c.id} style={s.rollupChip}>
          <Text style={s.rollupText} numberOfLines={1}>
            {c.estimated ? `≈${c.text}` : c.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function DayCard({
  date,
  cell,
  today,
  paceMinPerKm,
  selected,
  onOpen,
}: {
  date: string;
  cell: DayCell;
  today: string;
  paceMinPerKm?: number | null;
  selected: boolean;
  onOpen: (date: string) => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const rollup = dayRollup(cell, { paceMinPerKm });
  const open = () => onOpen(date);
  return (
    <View style={[s.dayCard, selected && s.dayCardSelected]} testID={`day-card-${date}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${longDayLabel(date)} details`}
        onPress={open}
        style={s.dayHeadPress}
      >
        <View style={s.dayHead}>
          <Text style={[s.dayTitle, date === today && { color: colors.accentText }]}>
            {longDayLabel(date)}
          </Text>
          {rollup.rest ? (
            <View style={s.restPill}>
              <Text style={s.restPillText}>Rest day</Text>
            </View>
          ) : (
            <RollupChips chips={rollupChips(rollup)} />
          )}
        </View>
      </Pressable>
      <RunList cell={cell} today={today} paceMinPerKm={paceMinPerKm} onPressRun={open} />
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    // --- day strip ---
    strip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.xs,
      paddingHorizontal: pageSpacing.rowPadX,
      paddingVertical: spacing.sm,
    },
    pill: {
      flex: 1,
      maxWidth: 56,
      minHeight: layout.minTouch - 6,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 1,
    },
    pillToday: { backgroundColor: p.accent, borderColor: p.accent },
    pillSelected: { backgroundColor: p.accentSoft, borderColor: p.accentText },
    pillLetter: { color: p.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    pillNum: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '700', fontVariant: ['tabular-nums'] },
    pillMarkers: { flexDirection: 'row', gap: 3, minHeight: 5, alignItems: 'center' },
    marker: { width: 5, height: 5, borderRadius: 3 },
    markerPlan: { borderWidth: 1.5, backgroundColor: 'transparent' },
    // --- run card ---
    runCard: {
      flexDirection: 'row',
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.bg,
      overflow: 'hidden',
    },
    runList: { gap: spacing.sm + 2 },
    edge: { width: 3, borderRadius: 2, alignSelf: 'stretch' },
    edgePlanned: { width: 5, borderRadius: 2.5, borderWidth: 1 },
    runBody: { flex: 1, minWidth: 0, padding: spacing.sm + 2, gap: 6 },
    runTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    runStart: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    runName: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '600', flexShrink: 1 },
    tagChip: {
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    tagText: { color: p.muted, fontSize: fontSize.tiny - 1, fontWeight: '600' },
    spring: { flex: 1, minWidth: spacing.xs },
    // --- rest row ---
    restRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: layout.minTouch - 16,
    },
    restText: { color: p.muted, fontSize: fontSize.small },
    restPill: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    restPillText: { color: p.muted, fontSize: fontSize.tiny, fontWeight: '600' },
    // --- day card ---
    dayCard: {
      paddingHorizontal: pageSpacing.rowPadX,
      paddingVertical: pageSpacing.rowPadY,
      gap: spacing.sm,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayCardSelected: { borderColor: p.borderStrong },
    dayHeadPress: { minHeight: layout.minTouch - 12, justifyContent: 'center' },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    dayTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '700', flexShrink: 1 },
    rollupRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      justifyContent: 'flex-end',
      flexShrink: 1,
    },
    rollupChip: {
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: 7,
      paddingVertical: 2,
    },
    rollupText: { color: p.muted, fontSize: fontSize.tiny, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
