/**
 * Week view building blocks (design spec docs/design/calendar-week-v2-spec.md;
 * mobile compact anatomy docs/design/calendar-week-mobile-spec.md v2.1).
 * Round-22 unification: the COMPACT anatomy is the ONLY anatomy — the owner
 * promoted the mobile rows to the canonical look, and the wide calendar uses
 * them at the hero's width (slightly more horizontal inset, same flat row
 * bones — no card-in-card boxes at any breakpoint):
 * - DayStrip: seven Mon–Sun pills (weekday letter + date number + status
 *   markers; today = filled, selected = tinted). Tap selects + scrolls.
 *   The in-hero variant (pinned mobile head AND the wide hero row) stretches
 *   the pills edge-to-edge; the standalone variant caps them at 56px.
 * - DayCard: a ≤36px header (32×32 date badge "TUE 27", today = accent fill,
 *   + day name + inline muted rollup "10.5km · 108") over edge-to-edge run
 *   rows; a rest day is ONE 32px line in the header (no duplicate moon row).
 * - RunCard: ONE ≤64px flat row: 3px status/zone edge, line 1 = time + name +
 *   optional type tag + status chip, line 2 = inline icon stats
 *   (distance · time · load, ≈ preserved). No inner card chrome; the whole
 *   row is the tap target (detail side panel ≥900px, sheet below).
 * - RunList: the day's runs (or rest line), shared with the month selection
 *   panel — the panel inherits the same rows automatically.
 *
 * Pure models come from @/lib/week-view; data plumbing is unchanged.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import type { DayCell } from '@intervals/core';
import { Badge } from '@/components/ui';
import { PressableScale } from '@/components/motion';
import {
  compactRollupText,
  compactStatCells,
  dayPills,
  dayRollup,
  dayRunModels,
  type DayPillModel,
  type RunCardModel,
  type RunStatus,
} from '@/lib/week-view';
import { fontSize, layout, pageSpacing, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import { WEEKDAY_SHORT, weekdayIndex } from '@/lib/dates';

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
  inHero = false,
}: {
  dates: string[];
  cellOf: (date: string) => DayCell | undefined;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  /** Round-19: rendered inside the hero — no own padding (the hero supplies
   *  it) and the pills stretch the full row (one-surface widget alignment). */
  inHero?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const pills: DayPillModel[] = dayPills(dates, cellOf, today);
  return (
    <View
      style={[s.strip, inHero && s.stripInHero]}
      testID="day-strip"
      accessibilityRole="tablist"
    >
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
              !inHero && s.pillCapped,
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
// Status chip + run row
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

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Line-2 icon per compact stat cell (spec §2: distance/timer/bolt). */
const STAT_ICON: Record<string, IconName> = {
  distance: 'footsteps-outline',
  time: 'time-outline',
  load: 'flash-outline',
};

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
  // planned = solid accent text at the 3px width; missed = ghosted muted;
  // race recorded without zone data falls back to the race token.
  const edgeColor =
    model.status === 'planned'
      ? colors.accentText
      : model.status === 'missed'
        ? colors.borderStrong
        : model.zone
          ? zoneColor(colors, model.zone)
          : model.status === 'race'
            ? colors.race
            : colors.muted;
  // Round-22: ONE flat row on the week surface at every width — no card
  // chrome. The whole row is the tap target (≥44px by two-line construction).
  return (
    <PressableScale
      onPress={onPress}
      style={[s.runRow, style]}
      accessibilityLabel={`Open ${model.title} details`}
    >
      <View style={[s.edge, { backgroundColor: edgeColor }]} />
      <View style={s.runRowBody}>
        <View style={s.runLine1}>
          {model.start ? <Text style={s.runStart}>{model.start}</Text> : null}
          <Text style={s.runName} numberOfLines={1}>
            {model.title}
          </Text>
          {model.tag ? (
            <Text style={s.runTag} numberOfLines={1}>
              {model.tag}
            </Text>
          ) : null}
          <View style={s.spring} />
          <StatusChip status={model.status} category={category} />
        </View>
        <View style={s.runLine2}>
          {compactStatCells(model.metrics).map((m) => (
            <View key={m.id} style={s.stat}>
              <Ionicons name={STAT_ICON[m.id] ?? 'ellipse-outline'} size={12} color={colors.muted} />
              <Text style={s.statText} numberOfLines={1}>
                {m.estimated ? `≈${m.value}` : m.value}
              </Text>
            </View>
          ))}
        </View>
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
      {models.map((m, i) => {
        const race = cell.events.find((e) => m.key === `e${e.id ?? e.uid ?? e.start_date_local}`);
        return (
          <Fragment key={m.key}>
            {i > 0 ? <View style={s.runSep} /> : null}
            <RunCard model={m} onPress={onPressRun} category={race?.category} />
          </Fragment>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// DayCard
// ---------------------------------------------------------------------------

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
  // ≤36px header (32×32 date badge + day name + inline muted rollup); a rest
  // day is the header's single 32px line — no moon row (spec §3).
  const rollupText = rollup.rest ? null : compactRollupText(rollup);
  const isToday = date === today;
  return (
    <View style={[s.dayCard, selected && s.dayCardSelected]} testID={`day-card-${date}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open ${longDayLabel(date)} details`}
        onPress={open}
        style={s.dayHeadPress}
      >
        <View style={s.dayHead}>
          <View style={[s.dateBadge, isToday && s.dateBadgeToday]}>
            <Text style={[s.dateBadgeDow, isToday && s.dateBadgeInkToday]}>
              {WEEKDAY_SHORT[weekdayIndex(date)]!.toUpperCase()}
            </Text>
            <Text style={[s.dateBadgeNum, isToday && s.dateBadgeInkToday]}>
              {Number(date.slice(8, 10))}
            </Text>
          </View>
          {/* no ellipsis on dates (owner round 18): the day name never
              truncates — the muted rollup yields instead */}
          <Text style={s.dayTitle}>{WEEKDAY_LONG[weekdayIndex(date)]}</Text>
          <View style={s.spring} />
          {rollup.rest ? (
            <View style={s.restInline}>
              <Ionicons name="moon-outline" size={14} color={colors.muted} />
              <Text style={s.restText}>Rest day</Text>
            </View>
          ) : rollupText ? (
            <Text style={s.rollupInline} numberOfLines={1}>
              {rollupText}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {/* rest day: the header line above IS the single rest line (spec §3) */}
      {rollup.rest ? null : (
        <RunList cell={cell} today={today} paceMinPerKm={paceMinPerKm} onPressRun={open} />
      )}
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
    // in-hero variant (round 19/22): the hero supplies side padding; the strip
    // fills its full-width row (flex along the row's main axis)
    stripInHero: { paddingHorizontal: 0, paddingVertical: 0, gap: 3, flex: 1 },
    pill: {
      flex: 1,
      minHeight: layout.minTouch - 6,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      gap: 1,
    },
    // standalone variant caps the pill so a wide row doesn't balloon them
    // (in-hero pills stretch instead — the widget alignment the owner picked)
    pillCapped: { maxWidth: 56 },
    pillToday: { backgroundColor: p.accent, borderColor: p.accent },
    pillSelected: { backgroundColor: p.accentSoft, borderColor: p.accentText },
    pillLetter: { color: p.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    pillNum: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '700', fontVariant: ['tabular-nums'] },
    pillMarkers: { flexDirection: 'row', gap: 3, minHeight: 5, alignItems: 'center' },
    marker: { width: 5, height: 5, borderRadius: 3 },
    markerPlan: { borderWidth: 1.5, backgroundColor: 'transparent' },
    // --- run row (calendar-week-mobile-spec §2, now every width): flat on the
    // week surface — no border, no fill, no rounding; ONE 3px status/zone
    // edge, square so it never reads as a double line (owner round 18). ---
    runRow: { flexDirection: 'row', alignItems: 'stretch' },
    edge: { width: 3, alignSelf: 'stretch' },
    runRowBody: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
    runLine1: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    runLine2: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { color: p.text, fontSize: fontSize.tiny + 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
    // flexShrink 0 explicit: RNW Text doesn't reset the CSS default (1), so an
    // unset value would truncate the tag on web while native keeps it whole.
    // The name (flexShrink 1) stays the only ellipsis surface (spec §2).
    runTag: { color: p.muted, fontSize: fontSize.tiny - 1, fontWeight: '600', flexShrink: 0 },
    runName: { color: p.text, fontSize: fontSize.small + 1, fontWeight: '600', flexShrink: 1 },
    runStart: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    spring: { flex: 1, minWidth: spacing.xs },
    runList: { gap: 4 },
    runSep: { height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginLeft: 15 },
    // --- rest row ---
    restInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    restRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 32 },
    restText: { color: p.muted, fontSize: fontSize.small },
    // --- day section (spec §1/§4): no own padding chrome at any width;
    // 16px day-to-day comes from 8+8 around the group's hairline. ---
    dayCard: {
      paddingVertical: spacing.sm,
      gap: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayCardSelected: { borderColor: p.borderStrong },
    dayHeadPress: { minHeight: layout.minTouch - 12, justifyContent: 'center' },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dayTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    dateBadge: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentSoft,
      flexShrink: 0,
    },
    dateBadgeToday: { backgroundColor: p.accent },
    dateBadgeDow: { color: p.accentText, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
    dateBadgeNum: {
      color: p.text,
      fontSize: 14,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      lineHeight: 16,
    },
    dateBadgeInkToday: { color: p.onAccent },
    rollupInline: {
      color: p.muted,
      fontSize: fontSize.tiny + 1,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
  });
