/**
 * Hero card v3 (design spec docs/design/calendar-home-v2-spec.md) — the top
 * nav and the week summary merged into ONE glass surface:
 * - Row 1 controls: range nav + Today, segmented week/month, sync. Side
 *   padding 14 so nothing hugs the 24px pill corners (the cramped-corner fix).
 * - Row 2: small-caps scope label + sync chip, then the tile strip
 *   (Distance / Time / Load / Form-ring mini) — 2×2 mobile, 4-across wide,
 *   internal hairlines, no nested cards.
 * - Verdict sentence (the hero's single line of prose) below the tiles.
 * - "Details" drawer: fitness CTL/ATL mini-tiles, zone bar + flagged chips
 *   (sentences live in hover/press tooltips), the gap as three stat chips
 *   with an info-i definition, recovery mini-tiles. Zero exposed prose
 *   paragraphs, no bare text arrows.
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
import { Ionicons } from '@expo/vector-icons';
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
import { Hint, InfoHint } from '@/components/Hint';
import { IconButton, StatTile } from '@/components/ui';
import {
  buildVerdict,
  fitnessTiles,
  formTileModel,
  gapCopy,
  gapModel,
  recoveryTiles,
  recoveryTrend,
  summaryTiles,
  tileHints,
  weekHonesty,
  zoneFlagChips,
  type FlagChipModel,
  type FormTileModel,
  type TileTone,
} from '@/lib/stats-view';
import { FormRing } from './FormRing';
import {
  fontSize,
  layout,
  lineHeight,
  radius,
  spacing,
  zoneColor,
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
  /** The CURRENT calendar week — verdict + gap are always about this week. */
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
  currentWeek,
}: HeroCardProps) {
  const { colors } = useTheme();
  const s = styles(colors);
  const { width: winW } = useWindowDimensions();
  const wide = winW >= WIDE_BREAKPOINT;
  const [open, setOpen] = useState(false);

  const trend = useMemo(
    () => (wellnessLoading ? null : fitnessTrend(wellness)),
    [wellness, wellnessLoading],
  );
  const plannedWeekLoad = useMemo(
    () => currentWeek.events.reduce((acc, e) => acc + (e.icu_training_load ?? 0), 0),
    [currentWeek.events],
  );
  const verdict = useMemo(() => buildVerdict(trend, plannedWeekLoad), [trend, plannedWeekLoad]);
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

  const hasDetails = trend != null || (zones != null && zones.totalSecs > 0) || gap != null || recoveryTilesList.length > 0;

  return (
    <GlassBar edge="none" floating style={s.hero} testID="hero-card">
      {/* Row 1 — controls. 14px side padding keeps everything clear of the
          24px rounded corners (design spec §1; measured in round 11).
          Left: range nav + Today. Right: sync chip + sync button. */}
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go to today"
          onPress={onToday}
          hitSlop={8}
          style={s.todayBtn}
        >
          <Text style={s.todayText}>Today</Text>
        </Pressable>
        <View style={s.spring} />
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
      </View>

      <View style={s.heroSep} />

      {/* Row 2 — window segmented + scope label, then the merged summary strip */}
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
        <Text style={s.scopeLabel}>{scopeLabel}</Text>
        <View style={s.spring} />
      </View>
      <View style={wide ? s.tilesRow : s.tilesGrid}>
        {strip.map((tile, i) => (
          <View key={tile.id} style={cellStyle(i, wide, colors.border)}>
            <StatTile
              label={tile.label}
              value={tile.value}
              valueTone={tile.valueTone}
              sub={tile.sub}
              hint={hints[tile.id] ?? undefined}
              testID={`tile-${tile.id}`}
            />
          </View>
        ))}
        <View style={cellStyle(strip.length, wide, colors.border)}>
          <FormCell model={formTile} />
        </View>
      </View>

      {/* The hero's single sentence (design spec §3) — everything it used to
          duplicate lives in the tiles above and the drawer below. */}
      {verdict ? (
        <Text
          accessibilityRole="text"
          style={[s.verdict, trend?.detraining && { color: colors.danger }]}
        >
          {verdict}
        </Text>
      ) : null}

      {/* SECONDARY — the "what it means" drawer */}
      {hasDetails ? (
        <View style={s.detailsWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={open ? { expanded: true } : { expanded: false }}
            accessibilityLabel={open ? 'Collapse details' : 'Expand details'}
            onPress={() => setOpen((v) => !v)}
            hitSlop={6}
            style={s.disclosure}
          >
            <Text style={s.disclosureText}>Details</Text>
            <Ionicons
              name={open ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.muted}
            />
          </Pressable>

          {open ? (
            <View style={s.details}>
              {/* Fitness — two mini-tiles with delta chips (design spec §4) */}
              {trend ? (
                <DetailBlock label="Fitness">
                  <View style={s.miniRow}>
                    {fitnessTiles(trend).map((tile) => (
                      <StatTile key={tile.id} size="sm" {...tile} style={s.miniTile} />
                    ))}
                  </View>
                </DetailBlock>
              ) : null}

              {/* Zone balance — bar + flagged chips, sentences in tooltips */}
              {zoneChips.length > 0 ? (
                <DetailBlock label="Zones this week">
                  <View style={s.zoneBar}>
                    <View
                      style={{ flexGrow: Math.max(zones!.lowPct, 1), backgroundColor: zoneColor(colors, 'Z2') }}
                    />
                    <View
                      style={{ flexGrow: Math.max(zones!.modPct, 1), backgroundColor: zoneColor(colors, 'Z3') }}
                    />
                    <View
                      style={{ flexGrow: Math.max(zones!.highPct, 1), backgroundColor: zoneColor(colors, 'Z5') }}
                    />
                  </View>
                  <View style={s.chipRow}>
                    {zoneChips.map((chip) => (
                      <FlagChip key={chip.id} chip={chip} />
                    ))}
                  </View>
                </DetailBlock>
              ) : null}

              {/* The gap — three stat chips, definition in the info tooltip */}
              {gapInfo ? (
                <DetailBlock
                  label="The gap"
                  hint={gapInfo.tooltip.join(' ')}
                >
                  <View style={s.miniRow}>
                    {gapInfo.chips.map((c) => (
                      <StatTile
                        key={c.id}
                        size="sm"
                        label={c.label}
                        value={c.value}
                        valueTone={c.tone === 'worse' ? 'worse' : undefined}
                        style={s.miniTile}
                        testID={`gap-${c.id}`}
                      />
                    ))}
                  </View>
                </DetailBlock>
              ) : null}

              {/* Recovery — three mini-tiles with delta chips */}
              {recoveryTilesList.length > 0 ? (
                <DetailBlock label="Recovery · 7-day">
                  <View style={s.miniRow}>
                    {recoveryTilesList.map((tile) => (
                      <StatTile key={tile.id} size="sm" {...tile} style={s.miniTile} />
                    ))}
                  </View>
                </DetailBlock>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </GlassBar>
  );
}

/** Grid cell wrappers with internal hairlines (no nested-card borders). */
function cellStyle(i: number, wide: boolean, borderColor: string): ViewStyle {
  const style: ViewStyle = { flexShrink: 1, minWidth: 0 };
  if (wide) {
    style.flex = 1;
    if (i > 0) {
      style.borderLeftWidth = StyleSheet.hairlineWidth;
      style.borderLeftColor = borderColor;
      style.paddingLeft = spacing.md;
    }
    return style;
  }
  // 2×2 grid: half-width cells, vertical hairline between columns, horizontal
  // hairline between rows.
  style.width = '50%';
  if (i % 2 === 1) {
    style.borderLeftWidth = StyleSheet.hairlineWidth;
    style.borderLeftColor = borderColor;
    style.paddingLeft = spacing.md;
  } else {
    style.paddingRight = spacing.sm;
  }
  if (i >= 2) {
    style.borderTopWidth = StyleSheet.hairlineWidth;
    style.borderTopColor = borderColor;
    style.paddingTop = spacing.sm + 2;
  }
  return style;
}

/** The FORM tile: mini ring + big signed value + band-word chip. */
function FormCell({ model }: { model: FormTileModel }) {
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
        <FormRing
          fraction={model.ring.fraction}
          color={toneColor[model.ring.tone]}
          track={colors.border}
          size={30}
          strokeWidth={3}
        />
        <Text style={[s.formValue, { color: valueColor }]} numberOfLines={1}>
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

/** Flagged zone chip: label + warning icon when flagged; tooltip = sentence. */
function FlagChip({ chip }: { chip: FlagChipModel }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const tone =
    chip.tone === 'red' ? colors.danger : chip.tone === 'amber' ? colors.mutedStrong : colors.muted;
  return (
    <Hint content={chip.detail} label={`${chip.label} — what this means`}>
      <View style={[s.flagChip, chip.tone !== 'neutral' && { borderColor: tone }]}>
        {chip.tone !== 'neutral' ? (
          <Ionicons name="warning" size={10} color={tone} />
        ) : null}
        <Text style={[s.flagChipText, { color: tone }]}>{chip.label}</Text>
      </View>
    </Hint>
  );
}

function DetailBlock({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.detailBlock}>
      <View style={s.detailLabelRow}>
        <Text style={s.detailLabel}>{label}</Text>
        {hint ? <InfoHint content={hint} label={`About ${label.toLowerCase()}`} /> : null}
      </View>
      {children}
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
    // --- tile strip: internal hairlines between cells ---
    tilesRow: { flexDirection: 'row' },
    tilesGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    tileCell: { flexShrink: 1, minWidth: 0 },
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
    verdict: {
      color: p.mutedStrong,
      fontSize: fontSize.small,
      lineHeight: lineHeight.small + 2,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    // --- details drawer ---
    detailsWrap: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: p.border,
      paddingTop: spacing.xs,
    },
    disclosure: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: 36,
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.xs,
      marginLeft: -spacing.xs,
      borderRadius: radius.sm,
    },
    disclosureText: { color: p.muted, fontSize: fontSize.small, fontWeight: '600' },
    details: { gap: spacing.md, paddingBottom: spacing.xs },
    detailBlock: { gap: spacing.xs },
    detailLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    detailLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    miniRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    miniTile: { minWidth: 72 },
    zoneBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
      gap: 1,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    flagChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    flagChipText: { fontSize: fontSize.tiny, fontWeight: '700', fontVariant: ['tabular-nums'] },
  });
