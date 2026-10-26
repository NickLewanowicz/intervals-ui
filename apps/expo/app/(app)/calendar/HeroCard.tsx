/**
 * Hero card v4 (design spec docs/design/calendar-hero-v4-spec.md) — the top
 * nav and the week summary as ONE glass surface:
 * - Row 1 controls: range nav + Today, segmented week/month, sync. Side
 *   padding 14 so nothing hugs the 24px pill corners (the cramped-corner fix).
 * - Row 2: small-caps scope label + sync chip, then the tile strip
 *   (Distance / Time / Load / Form-ring mini) — 2×2 mobile, 4-across wide.
 *   NO hairlines between tiles (v4: the wrapped verdict sentence used to
 *   push the grid and orphan the separators) — plain columns, spacing only.
 * - EVERY tile is tappable (v4): tapping any tile opens the coach drill-down
 *   StatusSheet (the DetailSheet chassis) with the coach bubble, the Gap,
 *   zone balance, fitness and recovery. The verdict sentence and the Details
 *   drawer are gone from the card — the tiles are the entry point.
 *
 * All numbers/text come from pure builders in `@/lib/stats-view` +
 * `@intervals/core`. Estimates keep their ≈; load is never fabricated.
 */
import {
  fenceRiders,
  fitnessTrend,
  zoneBalance,
  type Activity,
  type EventEx,
  type WellnessDay,
} from '@intervals/core';
import React, { useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewStyle,
} from 'react-native';
import { GlassBar } from '@/components/glass';
import { InfoHint } from '@/components/Hint';
import { IconButton, StatTile } from '@/components/ui';
import {
  coachStatusParagraph,
  formTileModel,
  gapCopy,
  gapModel,
  recoveryTiles,
  recoveryTrend,
  summaryTiles,
  tileHints,
  weekHonesty,
  zoneFlagChips,
  type FormTileModel,
  type TileTone,
} from '@/lib/stats-view';
import StatusSheet, { type StatusSheetContent } from './StatusSheet';
import { FormRing } from './FormRing';
import {
  fontSize,
  layout,
  radius,
  spacing,
  type Palette,
} from '@/theme';
import { useTheme } from '@/theme-context';

/** Viewport at which the tile strip flips from 2×2 to 4-across. */
const WIDE_BREAKPOINT = 900;

/** Subset of WeeklyStats the hero renders (month view aggregates the same shape). */
export interface CardStats {
  plannedDistanceM: number;
  plannedTimeSec: number;
  plannedLoad: number;
  actualDistanceM: number;
  actualTimeSec: number;
  actualLoad: number;
  longestRunM: number;
  plannedDistanceEstimated?: boolean;
  plannedTimeEstimated?: boolean;
  /** Week view only (spec: zone balance is a WEEKLY rollup). */
  zoneSeconds?: Record<string, number>;
}

export interface HeroCardProps {
  /** Which window the strip aggregates (drives the segmented control). */
  view: 'week' | 'month';
  /** Row-1 range label, e.g. "Oct 19–25" / "Oct 2026". */
  title: string;
  /** Small-caps scope label above the tiles, e.g. "THIS WEEK". */
  scopeLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onView: (v: 'week' | 'month') => void;
  onSync: () => void;
  syncing: boolean;
  /** Relative sync freshness for the chip ("2h ago"); null hides it. */
  freshness: string | null;
  onFreshnessPress?: () => void;
  stats: CardStats;
  /** Zone balance is a weekly rollup — week view only. */
  showZones: boolean;
  /** Newest-first wellness rows (wellness mirror). */
  wellness: WellnessDay[];
  wellnessLoading: boolean;
  /** Today (ISO) — decides which days project from actual vs planned loads. */
  today: string;
  /**
   * Round-19 mobile unification: the week day-strip rendered INSTEAD of the
   * range title in row 1 (the pills become the week indicator + selector, so
   * the range title can never ellipsize). Desktop omits it — title stays.
   */
  pills?: React.ReactNode;
  /** The CURRENT calendar week — coach read + gap are always about this week. */
  currentWeek: {
    events: EventEx[];
    activities: Activity[];
    /** "Sun" / "Sun 26" — horizon label on projections. */
    horizonLabel: string;
  };
}

export default function HeroCard({
  view,
  title,
  scopeLabel,
  onPrev,
  onNext,
  onToday,
  onView,
  onSync,
  syncing,
  freshness,
  onFreshnessPress,
  stats,
  showZones,
  wellness,
  wellnessLoading,
  today,
  pills,
  currentWeek,
}: HeroCardProps) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width: winW } = useWindowDimensions();
  const wide = winW >= WIDE_BREAKPOINT;
  /** Mobile hero anatomy (round 19): freshness + sync live on the label row so
   *  the controls row gives the range title full width (no date ellipsis). */
  const compact = !wide;
  /** v4: ANY tile tap opens the coach drill-down sheet (both scopes). */
  const [sheetOpen, setSheetOpen] = useState(false);
  const openSheet = () => setSheetOpen(true);

  const trend = useMemo(
    () => (wellnessLoading ? null : fitnessTrend(wellness)),
    [wellness, wellnessLoading],
  );
  const plannedWeekLoad = useMemo(
    () => currentWeek.events.reduce((acc, e) => acc + (e.icu_training_load ?? 0), 0),
    [currentWeek.events],
  );
  const actualWeekLoad = useMemo(
    () => currentWeek.activities.reduce((acc, a) => acc + (a.icu_training_load ?? 0), 0),
    [currentWeek.activities],
  );
  const honesty = useMemo(
    () => weekHonesty(currentWeek.events, currentWeek.activities, mondayOf(today), today),
    [currentWeek.events, currentWeek.activities, today],
  );
  const zones = useMemo(
    () => (showZones && stats.zoneSeconds ? zoneBalance(stats.zoneSeconds) : null),
    [showZones, stats.zoneSeconds],
  );
  const riders = useMemo(
    () => (showZones ? fenceRiders(currentWeek.activities) : []),
    [showZones, currentWeek.activities],
  );
  const gap = useMemo(
    () =>
      trend
        ? gapModel(trend, remainingWeekLoads(currentWeek.events, today), plannedWeekLoad)
        : null,
    [trend, currentWeek.events, today, plannedWeekLoad],
  );
  const recovery = useMemo(() => recoveryTrend(wellness), [wellness]);

  const strip = useMemo(() => summaryTiles(stats), [stats]);
  const hints = useMemo(() => tileHints(stats), [stats]);
  const formTile: FormTileModel = useMemo(
    () =>
      formTileModel(trend, wellnessLoading) ?? {
        id: 'form',
        label: 'Form',
        value: '—',
        sub: { text: 'no data yet', tone: 'neutral' },
        ring: { fraction: 0.5, word: '', tone: 'neutral' },
      },
    [trend, wellnessLoading],
  );
  const zoneChips = useMemo(
    () => (zones && zones.totalSecs > 0 ? zoneFlagChips(zones, riders, currentWeek.activities) : []),
    [zones, riders, currentWeek.activities],
  );
  const gapInfo = useMemo(
    () => (gap ? gapCopy(gap, currentWeek.horizonLabel, honesty) : null),
    [gap, currentWeek.horizonLabel, honesty],
  );
  const recoveryTilesList = useMemo(() => recoveryTiles(recovery), [recovery]);
  const coachText = useMemo(
    // the coach read is always about the LIVE week (never the viewed window)
    () => coachStatusParagraph({ trend, plannedLoad: plannedWeekLoad, actualLoad: actualWeekLoad, zones }),
    [trend, plannedWeekLoad, actualWeekLoad, zones],
  );
  const sheetContent: StatusSheetContent = useMemo(
    () => ({ coachText, trend, zones, zoneChips, gapInfo, recoveryTilesList }),
    [coachText, trend, zones, zoneChips, gapInfo, recoveryTilesList],
  );

  return (
    <GlassBar edge="none" floating style={s.hero} testID="hero-card">
      {/* Round-19 mobile unification: the week day-strip owns a full-width row
          at the top of the hero — the pills ARE the week indicator + selector,
          and the range title below gets the whole row width (freshness + sync
          moved down), so dates never ellipsize. Desktop keeps the classic
          single title row. */}
      {pills != null ? <View style={s.pillsRow}>{pills}</View> : null}
      {/* Row 1 — controls. 14px side padding keeps everything clear of the
          24px rounded corners (design spec §1; measured in round 11). */}
      <View style={s.controls}>
        <IconButton
          icon="chevron-back"
          label="Previous"
          onPress={onPrev}
          size={17}
          hitSlop={8}
          style={s.ctrlBtn}
        />
        <Text accessibilityRole="header" style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <IconButton
          icon="chevron-forward"
          label="Next"
          onPress={onNext}
          size={17}
          hitSlop={8}
          style={s.ctrlBtn}
        />
        <View style={s.spring} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          onPress={onToday}
          hitSlop={8}
          style={s.todayBtn}
        >
          <Text style={s.todayText}>Today</Text>
        </Pressable>
        {!compact ? (
          <>
            {freshness ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sync status — open settings"
                onPress={onFreshnessPress}
                hitSlop={8}
              >
                <Text style={s.freshness}>synced {freshness}</Text>
              </Pressable>
            ) : null}
            <IconButton
              icon="sync"
              label="Sync now"
              onPress={onSync}
              loading={syncing}
              size={15}
              hitSlop={10}
              style={s.syncBtn}
            />
          </>
        ) : null}
      </View>

      <View style={s.heroSep} />

      {/* Row 2 — window segmented + scope label, then the merged summary strip.
          On mobile the freshness chip + sync button live here: the controls row
          above gives the full range title every pixel it needs. */}
      <View style={s.labelRow}>
        <View style={s.segmented}>
          {(['week', 'month'] as const).map((v) => {
            const active = view === v;
            return (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : {}}
                accessibilityLabel={`${v} view`}
                onPress={() => onView(v)}
                style={[s.segBtn, active && { backgroundColor: colors.accent }]}
              >
                <Text style={[s.segText, { color: active ? colors.onAccent : colors.muted }]}>
                  {v === 'week' ? 'Week' : 'Month'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={s.scopeLabel} numberOfLines={1}>
          {scopeLabel}
        </Text>
        <View style={s.spring} />
        {compact ? (
          <>
            {freshness ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sync status — open settings"
                onPress={onFreshnessPress}
                hitSlop={8}
              >
                <Text style={s.freshness}>synced {freshness}</Text>
              </Pressable>
            ) : null}
            <IconButton
              icon="sync"
              label="Sync now"
              onPress={onSync}
              loading={syncing}
              size={15}
              hitSlop={10}
              style={s.syncBtn}
            />
          </>
        ) : null}
      </View>

      {/* The tile strip IS the entry point (v4): no verdict sentence, no
          drawer — tap any tile for the coach drill-down. */}
      <View style={s.tilesRow}>
        {strip.map((tile, i) => (
          <View key={tile.id} style={cellStyle(i, wide)}>
            <TileButton label={tile.label} onPress={openSheet}>
              <StatTile
                label={tile.label}
                value={tile.value}
                valueTone={tile.valueTone}
                sub={tile.sub}
                hint={hints[tile.id] ?? undefined}
                size={wide ? 'lg' : 'sm'}
                testID={`tile-${tile.id}`}
              />
            </TileButton>
          </View>
        ))}
        <View style={cellStyle(strip.length, wide)}>
          <TileButton label="Form" onPress={openSheet}>
            <FormCell model={formTile} compact={!wide} />
          </TileButton>
        </View>
      </View>

      {/* Coach drill-down: the old Details drawer content + the coach bubble
          lead, on the day-sheet chassis. Fine at both widths for v4. */}
      {sheetOpen ? (
        <StatusSheet content={sheetContent} onClose={() => setSheetOpen(false)} />
      ) : null}
    </GlassBar>
  );
}

/** Grid cell wrappers — plain columns, spacing only (v4 killed the per-tile
 *  hairlines: the wrapped verdict used to push the grid and orphan them). */
function cellStyle(i: number, wide: boolean): ViewStyle {
  const style: ViewStyle = { flexShrink: 1, minWidth: 0 };
  if (wide) {
    style.flex = 1;
    if (i > 0) {
      style.paddingLeft = spacing.md;
    }
    return style;
  }
  // 2×2 grid: half-width cells, spacing between columns and rows.
  style.width = '50%';
  if (i % 2 === 1) {
    style.paddingLeft = spacing.md;
  } else {
    style.paddingRight = spacing.sm;
  }
  if (i >= 2) {
    style.paddingTop = spacing.sm + 2;
  }
  return style;
}

/**
 * The v4 tile press wrapper: the WHOLE tile is the tap target (≥44px tall,
 * pressed dim) and opens the coach drill-down. The InfoHint inside still wins
 * the gesture negotiation (deepest-first), so tooltips keep working.
 */
function TileButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open training status — ${label}`}
      accessibilityHint="Opens the coach drill-down"
      onPress={onPress}
      style={({ pressed }) => [s.tileBtn, pressed && s.tileBtnPressed]}
      testID={`tile-press-${label.toLowerCase()}`}
    >
      {children}
    </Pressable>
  );
}

/** The FORM tile: mini ring + big signed value + band-word chip. */
function FormCell({ model, compact = false }: { model: FormTileModel; compact?: boolean }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const toneColor: Record<TileTone, string> = {
    better: colors.success,
    worse: colors.danger,
    neutral: colors.accentText,
  };
  const valueColor =
    model.valueTone === 'better'
      ? colors.success
      : model.valueTone === 'worse'
        ? colors.danger
        : colors.text;
  return (
    <View style={s.tile} testID="tile-form">
      <View style={s.tileLabelRow}>
        <Text style={s.tileLabel}>Form</Text>
        {model.hint ? <InfoHint content={model.hint} label="About form" /> : null}
      </View>
      <View style={s.formValueRow}>
        <Text
          style={[
            s.formValue,
            compact && { fontSize: 16 },
            { color: valueColor },
          ]}
          numberOfLines={1}
        >
          {model.value}
        </Text>
      </View>
      {model.sub ? (
        <Text style={[s.tileSubText, { color: model.sub.tone === 'neutral' ? colors.muted : toneColor[model.sub.tone] }]} numberOfLines={1}>
          {model.sub.text}
        </Text>
      ) : null}
    </View>
  );
}

/** Monday of an ISO date (matches core weekKey). */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Loads for the days AFTER today through Sunday — the projection horizon.
 * (The latest wellness row already includes today's load, per spec §2.1, so
 * projecting must start from tomorrow.)
 */
export function remainingWeekLoads(events: EventEx[], today: string): number[] {
  const mondayMs = Date.parse(`${mondayOf(today)}T00:00:00Z`);
  const sundayMs = mondayMs + 6 * 86_400_000;
  const loads: number[] = [];
  for (let ms = Date.parse(`${today}T00:00:00Z`) + 86_400_000; ms <= sundayMs; ms += 86_400_000) {
    const d = new Date(ms).toISOString().slice(0, 10);
    loads.push(
      events
        .filter((e) => e.start_date_local.slice(0, 10) === d)
        .reduce((sum, e) => sum + (e.icu_training_load ?? 0), 0),
    );
  }
  return loads;
}

const styles = (p: Palette) =>
  StyleSheet.create({
    // --- hero surface (one glass card, no nested cards) ---
    hero: {
      alignSelf: 'center',
      width: '100%',
      maxWidth: layout.maxW,
      paddingHorizontal: 14, // spec §1: 14 inside the pill (corner clearance)
      paddingVertical: spacing.sm + 2,
      gap: spacing.sm,
    },
    controls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    ctrlBtn: { width: 28, height: 28, borderRadius: radius.sm + 2 },
    title: {
      color: p.text,
      fontSize: fontSize.body,
      fontWeight: '700',
      flexShrink: 1,
    },
    // mobile week: the day-strip's own full-width row at the top of the hero
    pillsRow: { flexDirection: 'row', width: '100%' },
    spring: { flex: 1, minWidth: spacing.xs },
    todayBtn: {
      minHeight: 28,
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm + 2,
    },
    todayText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '700' },
    segmented: {
      flexDirection: 'row',
      backgroundColor: p.bg,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      padding: 2,
      gap: 2,
    },
    segBtn: {
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xs,
      paddingVertical: 3,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 42,
    },
    segText: { fontSize: fontSize.tiny + 1, fontWeight: '600' },
    syncBtn: { width: 26, height: 26, borderRadius: radius.sm + 1 },
    heroSep: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: p.borderGlass,
    },
    labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    scopeLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    freshness: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    // --- tile strip: plain columns, spacing does the grouping (v4) ---
    tilesRow: { flexDirection: 'row' },
    tileBtn: {
      // expand the touch target past the tile without shifting the grid
      padding: spacing.xs,
      margin: -spacing.xs,
      minHeight: layout.minTouch,
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    tileBtnPressed: { opacity: 0.55 },
    tile: { gap: 2, flexShrink: 1, minWidth: 0 },
    tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tileLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      flexShrink: 1,
    },
    formValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    formValue: { fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
    tileSubText: { fontSize: fontSize.tiny + 1, fontWeight: '600', fontVariant: ['tabular-nums'] },
  });
