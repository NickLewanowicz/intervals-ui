/**
 * Week view v2 building blocks (design spec docs/design/calendar-week-v2-spec.md;
 * mobile compact anatomy docs/design/calendar-week-mobile-spec.md v2.1):
 * - DayStrip: seven Mon–Sun pills (weekday letter + date number + status
 *   markers; today = filled, selected = tinted). Tap selects + scrolls.
 *   Unchanged on both breakpoints (owner sign-off).
 * - DayCard: desktop (≥ layout.wide) = titled day block — header row
 *   (weekday + date, rollup chips or a Rest-day pill) over RunCards.
 *   Mobile (< layout.wide) = FLAT rows on the one week surface: a ≤36px
 *   header (32×32 date badge "TUE 27", today = accent fill, + day name +
 *   inline muted rollup "10.5km · 108") over edge-to-edge run rows; a rest
 *   day is ONE 32px line in the header (no duplicate moon row).
 * - RunCard: desktop = card with intensity edge + status chip + MetricGrid.
 *   Mobile = ONE ≤64px row: 3px status/zone edge, line 1 = time + name +
 *   optional type tag + status chip, line 2 = inline icon stats
 *   (distance · time · load, ≈ preserved). No inner card chrome; the whole
 *   row is the tap target (detail sheet on mobile).
 * - RunList: the day's runs (or rest line), shared with the month selection
 *   panel — the panel inherits the compact rows automatically.
 *
 * Pure models come from @/lib/week-view; data plumbing is unchanged.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { Fragment } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { DayCell } from '@intervals/core';
import { Badge } from '@/components/ui';
import { PressableScale } from '@/components/motion';
import MetricGrid from './MetricGrid';
import {
  compactRollupText,
  compactStatCells,
  dayPills,
  dayRollup,
  dayRunModels,
  rollupChips,
  type DayPillModel,
  type MetricCell,
  type RollupChip,
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

/** Below this viewport the week view renders the compact mobile anatomy. */
function useCompact(): boolean {
  const { width } = useWindowDimensions();
  return width < layout.wide;
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
  /** Round-19 mobile: rendered inside the hero's controls row — no own
   *  padding (the hero supplies it), tighter gaps for the narrower slot. */
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
  const compact = useCompact();
  const s = styles(colors);
  // Intensity accent edge (spec §2): recorded = solid dominant-zone color;
  // planned = outlined accent on desktop, solid accent text at the compact
  // 3px width; missed = ghosted muted; race recorded without zone data falls
  // back to the race token.
  const edgeColor =
    model.status === 'planned'
      ? compact
        ? colors.accentText
        : undefined
      : model.status === 'missed'
        ? colors.borderStrong
        : model.zone
          ? zoneColor(colors, model.zone)
          : model.status === 'race'
            ? colors.race
            : colors.muted;
  if (compact) {
    // v2.1 mobile: ONE flat row on the week surface — no card chrome. The
    // whole row is the tap target (≥44px by two-line construction).
    return (
      <PressableScale
        onPress={onPress}
        style={[s.runRow, style]}
        accessibilityLabel={`Open ${model.title} details`}
      >
        <View style={[s.edgeCompact, edgeColor ? { backgroundColor: edgeColor } : null]} />
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
  return (
    <PressableScale
      onPress={onPress}
      style={[s.runCard, style]}
      accessibilityLabel={`Open ${model.title} details`}
    >
      <View style={cardEdgeStyle(model, colors) as StyleProp<ViewStyle>} />
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

/** Desktop card edge (unchanged round-13 look): solid zone/race/muted, or the
 *  outlined accent treatment for planned. */
function cardEdgeStyle(model: RunCardModel, colors: ReturnType<typeof useTheme>['colors']) {
  const s = styles(colors);
  if (model.status === 'planned') return [s.edgePlanned, { borderColor: colors.accentText, backgroundColor: colors.accentSoft }];
  if (model.status === 'missed') return [s.edge, { backgroundColor: colors.borderStrong }];
  return [
    s.edge,
    {
      backgroundColor: model.zone
        ? zoneColor(colors, model.zone)
        : model.status === 'race'
          ? colors.race
          : colors.muted,
    },
  ];
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
  const compact = useCompact();
  const s = styles(colors);
  const models = dayRunModels(cell, { today, paceMinPerKm });
  if (models.length === 0) {
    return (
      <View style={compact ? s.restRowCompact : s.restRow}>
        <Ionicons name="moon-outline" size={14} color={colors.muted} />
        <Text style={s.restText}>Rest day</Text>
      </View>
    );
  }
  const runCard = (m: RunCardModel) => {
    const race = cell.events.find((e) => m.key === `e${e.id ?? e.uid ?? e.start_date_local}`);
    return <RunCard key={m.key} model={m} onPress={onPressRun} category={race?.category} />;
  };
  if (compact) {
    return (
      <View style={s.runListCompact}>
        {models.map((m, i) => (
          <Fragment key={m.key}>
            {i > 0 ? <View style={s.runSep} /> : null}
            {runCard(m)}
          </Fragment>
        ))}
      </View>
    );
  }
  return <View style={s.runList}>{models.map((m) => runCard(m))}</View>;
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
  const compact = useCompact();
  const s = styles(colors);
  const rollup = dayRollup(cell, { paceMinPerKm });
  const open = () => onOpen(date);
  if (compact) {
    // v2.1 mobile: ≤36px header (32×32 date badge + day name + inline muted
    // rollup); a rest day is the header's single 32px line — no moon row.
    const rollupText = rollup.rest ? null : compactRollupText(rollup);
    const isToday = date === today;
    return (
      <View style={[s.dayCardCompact, selected && s.dayCardSelected]} testID={`day-card-${date}`}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${longDayLabel(date)} details`}
          onPress={open}
          style={s.dayHeadPress}
        >
          <View style={s.dayHeadCompact}>
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
    // in-hero variant (round 19 mobile): the hero supplies side padding; the
    // strip fills its full-width row (flex along the row's main axis)
    stripInHero: { paddingHorizontal: 0, paddingVertical: 0, gap: 3, flex: 1 },
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
    // --- run card (desktop ≥ layout.wide; unchanged round-13) ---
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
    // --- run row (mobile compact, calendar-week-mobile-spec §2): flat on the
    // week surface — no border, no fill, no rounding; ONE 3px status/zone
    // edge, square so it never reads as a double line (owner round 18). ---
    runRow: { flexDirection: 'row', alignItems: 'stretch' },
    edgeCompact: { width: 3, alignSelf: 'stretch' },
    runRowBody: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 10, gap: 3 },
    runLine1: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    runLine2: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
    stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    statText: { color: p.text, fontSize: fontSize.tiny + 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
    // flexShrink 0 explicit: RNW Text doesn't reset the CSS default (1), so an
    // unset value would truncate the tag on web while native keeps it whole.
    // The name (flexShrink 1) stays the only ellipsis surface (spec §2).
    runTag: { color: p.muted, fontSize: fontSize.tiny - 1, fontWeight: '600', flexShrink: 0 },
    runListCompact: { gap: 4 },
    runSep: { height: StyleSheet.hairlineWidth, backgroundColor: p.border, marginLeft: 15 },
    // --- rest row ---
    restRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      minHeight: layout.minTouch - 16,
    },
    restRowCompact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, height: 32 },
    restInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
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
    // --- day card (desktop; unchanged round-13) ---
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
    // --- day section (mobile compact, spec §1/§4): no own padding chrome;
    // 16px day-to-day comes from 8+8 around the group's hairline. ---
    dayCardCompact: {
      paddingVertical: spacing.sm,
      gap: 6,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    dayHeadCompact: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
