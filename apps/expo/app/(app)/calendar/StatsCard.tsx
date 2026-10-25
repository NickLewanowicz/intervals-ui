/**
 * Stats card v2 (round 9) — per docs/research/athlete-dashboard-metrics.md:
 * PRIMARY (always visible): headline verdict · form line with direction arrow
 * + band word · this window's planned→actual strip + honesty split.
 * SECONDARY ("Details" disclosure, collapsed by default): fitness trend,
 * zone balance, gap card, recovery trends.
 *
 * All numbers/text come from pure builders in `@/lib/stats-view` +
 * `@intervals/core`. Estimates keep their ≈; load is never fabricated.
 */
import {
  fenceRiders,
  fitnessTrend,
  formatDuration,
  formatKm,
  FORM_BAND_WORD,
  zoneBalance,
  type Activity,
  type EventEx,
  type WellnessDay,
} from '@intervals/core';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '@/components/glass';
import { Icon } from '@/components/ui';
import { dayLabel } from '@/lib/dates';
import {
  buildVerdict,
  fmt1dp,
  fmtHours,
  gapLine,
  gapModel,
  recoveryTrend,
  signedInt,
  trendArrow,
  weekHonesty,
} from '@/lib/stats-view';
import { fontSize, pageSpacing, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

/** Subset of WeeklyStats the card renders (month view aggregates the same shape). */
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

export interface StatsCardProps {
  caption: string;
  stats: CardStats;
  showLongest: boolean;
  showZones: boolean;
  /** Relative sync freshness for the header ("2h ago"); null → hidden. */
  freshness: string | null;
  onFreshnessPress?: () => void;
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

export default function StatsCard({
  caption,
  stats,
  showLongest,
  showZones,
  freshness,
  onFreshnessPress,
  wellness,
  wellnessLoading,
  today,
  currentWeek,
}: StatsCardProps) {
  const { colors } = useTheme();
  const s = styles(colors);
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

  const hasDetails = (zones != null && zones.totalSecs > 0) || gap != null || recovery.any;
  const bandColor = !trend
    ? colors.muted
    : trend.band === 'fatigued' || trend.band === 'deeply-fatigued'
      ? colors.danger
      : trend.band === 'neutral'
        ? colors.text
        : colors.success;

  return (
    <GlassCard style={s.card} testID="stats-card">
      {/* header: scope caption + sync freshness (transparency) */}
      <View style={s.head}>
        <Text style={s.caption} numberOfLines={1} ellipsizeMode="tail">
          {caption}
        </Text>
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
      </View>

      {/* PRIMARY — headline verdict (spec §3 templates) */}
      {verdict ? (
        <Text style={[s.verdict, trend?.detraining && { color: colors.danger }]}>{verdict}</Text>
      ) : null}

      {/* PRIMARY — form line: direction arrow + band word */}
      <View style={s.formRow}>
        <Text style={s.formLabel}>Form</Text>
        {trend ? (
          <>
            <Text style={[s.formValue, { color: bandColor }]}>
              {signedInt(trend.form)} {trendArrow(trend.formDelta7)}
            </Text>
            <Text style={[s.formBand, { color: bandColor }]}>{FORM_BAND_WORD[trend.band]}</Text>
            {trend.ctlDelta7 != null ? (
              <Text style={s.formTrend}>
                CTL {fmt1dp(trend.ctl)} {trendArrow(trend.ctlDelta7)} {signedInt(trend.ctlDelta7)}/wk
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={s.formBand}>{wellnessLoading ? '…' : 'no wellness data yet'}</Text>
        )}
      </View>

      {/* PRIMARY — this window's planned → actual strip */}
      <View style={s.statsGrid}>
        <Stat
          label="Distance"
          planned={fmtKmOrDash(stats.plannedDistanceM, stats.plannedDistanceEstimated)}
          actual={fmtKmOrDash(stats.actualDistanceM)}
        />
        <Stat
          label="Time"
          planned={fmtDurOrDash(stats.plannedTimeSec, stats.plannedTimeEstimated)}
          actual={stats.actualTimeSec ? formatDuration(stats.actualTimeSec) : '—'}
        />
        <Stat
          label="Load"
          planned={stats.plannedLoad ? String(Math.round(stats.plannedLoad)) : '—'}
          actual={stats.actualLoad ? String(Math.round(stats.actualLoad)) : '—'}
        />
        {showLongest ? (
          <Stat
            label="Longest run"
            actual={stats.longestRunM ? formatKm(stats.longestRunM) : '—'}
            planned="—"
            hidePlanned
          />
        ) : null}
      </View>
      {stats.plannedDistanceEstimated || stats.plannedTimeEstimated ? (
        <Text style={s.footnote}>≈ estimated from time at your recent pace</Text>
      ) : null}
      {/* honesty split (spec §1.1): extra load is never silently absorbed */}
      {honesty.extraCount > 0 || honesty.missedCount > 0 ? (
        <Text style={s.honesty}>
          {[
            honesty.extraCount > 0
              ? `+${Math.round(honesty.extraLoad)} unplanned (${honesty.extraCount} extra run${honesty.extraCount > 1 ? 's' : ''})`
              : null,
            honesty.missedCount > 0
              ? `${honesty.missedCount} missed (${Math.round(honesty.missedLoad)} load)`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
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
            <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </Pressable>

          {open ? (
            <View style={s.details}>
              {/* Fitness trend (spec §1.3) — absolute CTL/ATL live here, not on the strip */}
              {trend ? (
                <DetailBlock label="Fitness">
                  <Text style={s.detailLine}>
                    {`CTL ${fmt1dp(trend.ctl)} ${trendArrow(trend.ctlDelta7)} ${
                      trend.ctlDelta7 != null ? `${signedInt(trend.ctlDelta7)}/wk` : '—'
                    } · ATL ${fmt1dp(trend.atl)} ${trendArrow(trend.atlDelta7)} ${
                      trend.atlDelta7 != null ? `${signedInt(trend.atlDelta7)}/wk` : '—'
                    }`}
                  </Text>
                  {trend.detraining ? (
                    <Text style={[s.flag, { color: colors.danger }]}>
                      Fresher, but fitness falling — this is detraining, not a taper (est).
                    </Text>
                  ) : null}
                </DetailBlock>
              ) : null}

              {/* Zone balance (spec §1.2) — weekly rollup + flags */}
              {zones && zones.totalSecs > 0 ? (
                <DetailBlock label="Zones this week">
                  <View style={s.zoneBar}>
                    <View
                      style={{ flexGrow: Math.max(zones.lowPct, 1), backgroundColor: zoneColor(colors, 'Z2') }}
                    />
                    <View
                      style={{ flexGrow: Math.max(zones.modPct, 1), backgroundColor: zoneColor(colors, 'Z3') }}
                    />
                    <View
                      style={{ flexGrow: Math.max(zones.highPct, 1), backgroundColor: zoneColor(colors, 'Z5') }}
                    />
                  </View>
                  <View style={s.zoneLegend}>
                    <ZonePct color={zoneColor(colors, 'Z2')} label={`LOW ${zones.lowPct}%`} />
                    <ZonePct color={zoneColor(colors, 'Z3')} label={`MOD ${zones.modPct}%`} />
                    <ZonePct color={zoneColor(colors, 'Z5')} label={`HIGH ${zones.highPct}%`} />
                  </View>
                  {zones.lowFlag === 'amber' ? (
                    <Text style={s.flagAmber}>LOW {zones.lowPct}% — easy runs are drifting.</Text>
                  ) : null}
                  {zones.moderateTrap ? (
                    <Text style={[s.flag, { color: colors.danger }]}>
                      LOW {zones.lowPct}% — moderate-trap warning: the week is mostly middle intensity.
                    </Text>
                  ) : null}
                  {zones.modFlag === 'amber' ? (
                    <Text style={s.flagAmber}>MOD {zones.modPct}% — drifting up.</Text>
                  ) : null}
                  {zones.modFlag === 'red' ? (
                    <Text style={[s.flag, { color: colors.danger }]}>
                      MOD {zones.modPct}% — threshold-heavy weeks add fatigue without fitness.
                    </Text>
                  ) : null}
                  {zones.highFlag === 'red' ? (
                    <Text style={[s.flag, { color: colors.danger }]}>
                      HIGH {zones.highPct}% — above the 2-quality-sessions ceiling.
                    </Text>
                  ) : null}
                  {riders.slice(0, 2).map((r) => {
                    const act = currentWeek.activities.find((a) => a.id === r.id);
                    return (
                      <Text key={r.id} style={s.flagAmber}>
                        {act ? `${dayLabel(act.start_date_local.slice(0, 10))} ` : ''}
                        “{r.name ?? 'run'}” sat in Z3 {r.z3Pct}% — this is where the trap lives.
                      </Text>
                    );
                  })}
                </DetailBlock>
              ) : null}

              {/* Gap card (spec §2) */}
              {gap ? (
                <DetailBlock label="The gap">
                  <Text style={s.detailLine}>{gapLine(gap, currentWeek.horizonLabel)}</Text>
                  <Text style={s.detailSub}>
                    Hold-flat = the weekly load that keeps form exactly where it is. Fitness-flat
                    would be {Math.round(7 * gap.ctl0)}/wk; hold-flat adjusts for the form you're
                    carrying.
                  </Text>
                </DetailBlock>
              ) : null}

              {/* Recovery context (spec §1.7) — 7-day directions only, never single days */}
              {recovery.any ? (
                <DetailBlock label="Recovery · 7-day">
                  <View style={s.recoveryRow}>
                    {recovery.hrv.avg != null ? (
                      <Text style={s.detailLine}>
                        HRV {recovery.hrv.avg.toFixed(1)} {trendArrow(recovery.hrv.delta)}
                        {recovery.hrv.delta != null && Math.abs(recovery.hrv.delta) >= 0.5
                          ? ` ${signedInt(recovery.hrv.delta)}`
                          : ''}
                      </Text>
                    ) : null}
                    {recovery.rhr.avg != null ? (
                      <Text style={s.detailLine}>
                        RHR {Math.round(recovery.rhr.avg)} {trendArrow(recovery.rhr.delta)}
                        {recovery.rhr.delta != null && Math.abs(recovery.rhr.delta) >= 0.5
                          ? ` ${signedInt(recovery.rhr.delta)}`
                          : ''}
                      </Text>
                    ) : null}
                    {recovery.sleep.avgSecs != null ? (
                      <Text style={s.detailLine}>
                        Sleep {fmtHours(recovery.sleep.avgSecs)} {trendArrow(recovery.sleep.deltaSecs)}
                        {recovery.sleep.deltaSecs != null && Math.abs(recovery.sleep.deltaSecs) >= 1800
                          ? ` ${signedInt(recovery.sleep.deltaSecs / 3600)}h`
                          : ''}
                      </Text>
                    ) : null}
                  </View>
                  {recovery.hrv.flag ? (
                    <Text style={s.flagAmber}>HRV down 3 days running — worth easing off.</Text>
                  ) : null}
                  {recovery.rhr.flag ? (
                    <Text style={s.flagAmber}>Resting HR up 3 days running.</Text>
                  ) : null}
                </DetailBlock>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </GlassCard>
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

function ZonePct({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.zonePct}>
      <View style={[s.zoneSwatch, { backgroundColor: color }]} />
      <Text style={s.zonePctText}>{label}</Text>
    </View>
  );
}

function Stat({
  label,
  planned,
  actual,
  hidePlanned,
}: {
  label: string;
  planned: string;
  actual: string;
  hidePlanned?: boolean;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.stat}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValues}>
        {hidePlanned ? null : <Text style={s.statPlanned}>{planned}</Text>}
        {hidePlanned ? null : <Text style={s.statSep}> → </Text>}
        <Text style={s.statActual}>{actual}</Text>
      </Text>
    </View>
  );
}

function DetailBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.detailBlock}>
      <Text style={s.detailLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** Planned cells carry "≈" when (part of) the total was pace-estimated. */
function fmtKmOrDash(m: number, estimated?: boolean): string {
  return m > 0 ? (estimated ? '≈' : '') + formatKm(m) : '—';
}

function fmtDurOrDash(sec: number, estimated?: boolean): string {
  return sec > 0 ? (estimated ? '≈' : '') + formatDuration(sec) : '—';
}

const styles = (p: Palette) =>
  StyleSheet.create({
    card: { padding: pageSpacing.cardPad, gap: spacing.sm + 2 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    caption: {
      color: p.muted,
      fontSize: fontSize.tiny,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      flexShrink: 1,
    },
    freshness: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    verdict: { color: p.text, fontSize: fontSize.small + 1, lineHeight: 20, fontWeight: '600' },
    formRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
    formLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
    formValue: { fontSize: fontSize.h, fontWeight: '700', fontVariant: ['tabular-nums'] },
    formBand: { color: p.text, fontSize: fontSize.small, fontWeight: '600' },
    formTrend: { color: p.muted, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
    stat: { gap: 2, minWidth: 90 },
    statLabel: { color: p.muted, fontSize: fontSize.tiny, textTransform: 'uppercase', letterSpacing: 0.5 },
    statValues: { fontSize: fontSize.body, fontVariant: ['tabular-nums'] },
    statPlanned: { color: p.muted },
    statSep: { color: p.muted },
    statActual: { color: p.text, fontWeight: '600' },
    footnote: { color: p.muted, fontSize: fontSize.tiny, marginTop: -spacing.xs },
    honesty: { color: p.mutedStrong, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
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
    detailLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    detailLine: { color: p.text, fontSize: fontSize.small, fontVariant: ['tabular-nums'] },
    detailSub: { color: p.muted, fontSize: fontSize.tiny, lineHeight: 16 },
    zoneBar: {
      flexDirection: 'row',
      height: 10,
      borderRadius: radius.sm,
      overflow: 'hidden',
      backgroundColor: p.border,
      gap: 1,
    },
    zoneLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    zonePct: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    zonePctText: { color: p.muted, fontSize: fontSize.tiny, fontVariant: ['tabular-nums'] },
    zoneSwatch: { width: 8, height: 8, borderRadius: 4 },
    flag: { fontSize: fontSize.tiny, lineHeight: 16 },
    flagAmber: { color: p.mutedStrong, fontSize: fontSize.tiny, lineHeight: 16 },
    recoveryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  });
