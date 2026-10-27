/**
 * DetailSidePanel (week-view v2 spec §3, desktop ≥900px) — the day detail
 * rendered to the RIGHT of the week list: the list column narrows and the
 * panel slides/fades in (~200ms, the motion spec's range). One detail at a
 * time; switching days re-targets in place (pure fade). "Open full" keeps
 * the deep-linkable /calendar/day route available; X / parent state closes.
 *
 * Animation: the parent owns a single 0..1 Animated.Value (it also drives
 * the week column's maxWidth), passed in as `progress`. JS-driven (width is
 * a layout prop) — desktop-only surface; native phones use DetailSheet.
 * While the exit animation runs, the last open day stays visible via `shown`.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Badge, IconButton } from '@/components/ui';
import { GlassSurface } from '@/components/glass';
import { SlideFadeIn } from '@/components/motion';
import DayDetails from './DayDetails';
import { MONTHS, dayLabel } from '@/lib/dates';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { DayCell } from '@intervals/core';

/** Fixed inner width of the panel (the wrap animates 0 → W + gap). */
export const PANEL_W = 360;
const PANEL_GAP = spacing.lg;

export default function DetailSidePanel({
  date,
  cellFor,
  today,
  paceMinPerKm,
  progress,
  onClose,
}: {
  /** Target day (null = closed). */
  date: string | null;
  /** Day-cell lookup over the loaded window (kept current by the parent). */
  cellFor: (date: string) => DayCell;
  today: string;
  /** Athlete pace (min/km) — planned targets keep their ≈ estimates (QA A3). */
  paceMinPerKm?: number | null;
  /** 0 (closed) → 1 (open), owned by the calendar screen. */
  progress: Animated.Value;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const lastDate = useRef<string | null>(date);
  const [shown, setShown] = useState<string | null>(date);

  if (date !== lastDate.current) {
    lastDate.current = date;
    if (date) setShown(date);
  }

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PANEL_W + PANEL_GAP],
  });
  const opacity = progress;
  const tx = progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });

  return (
    <Animated.View
      pointerEvents={date ? 'auto' : 'none'}
      style={[s.panelWrap, { width, opacity, transform: [{ translateX: tx }] }]}
      testID="detail-panel"
    >
      {shown ? (
        <GlassSurface style={s.panel} testID="detail-panel-surface">
          <View style={s.head} accessibilityLabel={`Day detail panel for ${dayLabel(shown)}`}>
            <Text accessibilityRole="header" style={s.title} numberOfLines={1}>
              {`${dayLabel(shown)} ${MONTHS[Number(shown.slice(5, 7)) - 1]!.slice(0, 3)}`}
            </Text>
            {shown === today ? <Badge label="today" tone="accent" /> : null}
            <View style={s.spring} />
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open full day detail for ${dayLabel(shown)}`}
              onPress={() => router.push({ pathname: '/calendar/day', params: { date: shown } })}
              hitSlop={8}
              style={s.openFull}
            >
              <Text style={s.openFullText}>Open full</Text>
              <Ionicons name="open-outline" size={12} color={colors.accentText} />
            </Pressable>
            <IconButton
              icon="close"
              label="Close day detail"
              onPress={onClose}
              size={16}
              hitSlop={8}
              style={s.closeBtn}
            />
          </View>
          <SlideFadeIn key={shown} dep={shown} direction={0} style={s.body}>
            <DayDetails cell={cellFor(shown)} today={today} paceMinPerKm={paceMinPerKm} />
          </SlideFadeIn>
        </GlassSurface>
      ) : null}
    </Animated.View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    panelWrap: {
      overflow: 'hidden',
      // desktop-web: pin the panel while the week list scrolls (RN-only value;
      // the panel never renders on native phones — they use the sheet)
      ...(Platform.OS === 'web' ? { position: 'sticky' as const, top: spacing.sm } : null),
    },
    panel: {
      width: PANEL_W,
      marginRight: PANEL_GAP,
      // round-22: same glass chassis as the hero (translucent surface, light
      // hairline, big pill radius) so panel + one-surface calendar read as one
      // system — not a solid card bolted on
      borderRadius: radius.xl,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      padding: spacing.lg,
      gap: spacing.md,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    title: { color: p.text, fontSize: fontSize.h, fontWeight: '700', flexShrink: 1 },
    spring: { flex: 1 },
    openFull: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: layout.minTouch - 16,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm,
    },
    openFullText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '600' },
    closeBtn: { width: 28, height: 28, borderRadius: radius.sm + 1 },
    body: { flexShrink: 1 },
  });
