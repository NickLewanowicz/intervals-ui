/**
 * StatusSheet (calendar-hero-v4 spec: the coach drill-down) — opens when any
 * hero tile is tapped. Same chassis as the day DetailSheet: slide-up Modal,
 * grab handle, scrim (tap to close), drag-the-handle-to-close, X. Content,
 * top → bottom: the coach bubble (avatar + deterministic status paragraph
 * from `coachStatusParagraph`), the Gap chips, zone balance, the fitness
 * CTL/ATL tiles and the 7-day recovery tiles — the old Details drawer,
 * deduplicated, with the coach read on top. A sheet is fine at both widths
 * for v4 (spec: "a sheet is fine at both widths for v1").
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Hint, InfoHint } from '@/components/Hint';
import { IconButton, StatTile } from '@/components/ui';
import {
  fitnessTiles,
  type FlagChipModel,
  type GapCopy,
  type TileModel,
} from '@/lib/stats-view';
import { fontSize, lineHeight, radius, spacing, zoneColor, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { FitnessTrend, ZoneBalance } from '@intervals/core';

const COACH_AVATAR = require('@/assets/coach-avatar.png');

/** Drag distance (px) past which a handle release closes the sheet. */
const CLOSE_DRAG = 110;
/** Min downward drag (px) before a fast release counts as a close fling. */
const FLING_MIN_DRAG = 12;
/** Scrim press slop (px): a release farther than this is a swipe, not a tap. */
const TAP_SLOP = 10;

/** Everything the sheet renders, precomputed by HeroCard's pure builders. */
export interface StatusSheetContent {
  /** The coach bubble paragraph (never null — the helper has a fallback). */
  coachText: string | null;
  trend: FitnessTrend | null;
  zones: ZoneBalance | null;
  zoneChips: FlagChipModel[];
  gapInfo: GapCopy | null;
  recoveryTilesList: TileModel[];
}

export default function StatusSheet({
  content,
  onClose,
}: {
  content: StatusSheetContent;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  // where the current scrim press started (swipe-vs-tap discrimination)
  const scrimPress = useRef<{ x: number; y: number } | null>(null);

  // re-open per content refresh: reset any residual drag offset
  useEffect(() => {
    drag.setValue(0);
  }, [content, drag]);

  const panResponder = useRef(
    PanResponder.create({
      // claim at touch start: the pan responder owns every touch that begins
      // in the head row — a Pressable wrapper here would claim the gesture
      // first and the drag would never engage. Buttons inside still win the
      // negotiation (deepest-first), so X keeps working.
      onStartShouldSetPanResponder: () => true,
      // a drag must not be hijacked (web text selection / native scroll).
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) drag.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > CLOSE_DRAG || (g.dy > FLING_MIN_DRAG && g.vy > 0.9)) {
          onClose();
        }
        // JS-driven on purpose: drag.setValue() must not mix with a
        // native-driven node (it throws on native).
        Animated.spring(drag, { toValue: 0, friction: 18, tension: 300, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, friction: 18, tension: 300, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const { coachText, trend, zones, zoneChips, gapInfo, recoveryTilesList } = content;

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onClose}
      accessibilityLabel="Training status"
    >
      <Pressable
        style={s.overlay}
        accessibilityLabel="Close training status"
        onPressIn={(e) => {
          scrimPress.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }}
        onPress={(e) => {
          // honour a press as a close-tap only when the release lands within
          // TAP_SLOP of where it started (a long swipe must not close); a
          // press with no recorded start is screen-reader activation — close.
          const start = scrimPress.current;
          scrimPress.current = null;
          if (!start) {
            onClose();
            return;
          }
          const dx = e.nativeEvent.pageX - start.x;
          const dy = e.nativeEvent.pageY - start.y;
          if (Math.sqrt(dx * dx + dy * dy) < TAP_SLOP) onClose();
        }}
      >
        <Animated.View
          style={[s.sheet, { paddingBottom: insets.bottom + spacing.lg, transform: [{ translateY: drag }] }]}
          testID="status-sheet"
        >
          {/* handle row: drag to close — also the sheet's grab area */}
          <View style={s.handleRow} {...panResponder.panHandlers}>
            <View style={s.grabber} />
            <View style={s.head}>
              <Text accessibilityRole="header" style={s.title} numberOfLines={1}>
                Your training, right now
              </Text>
              <View style={s.spring} />
              <IconButton icon="close" label="Close training status" onPress={onClose} size={16} hitSlop={8} />
            </View>
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* 1 — the coach bubble: avatar + deterministic status paragraph */}
            <View style={s.coachStrip}>
              <Image
                source={COACH_AVATAR}
                style={s.coachAvatar}
                accessibilityIgnoresInvertColors
              />
              <Text accessibilityRole="text" style={s.coachText}>
                {coachText ?? 'No wellness data yet — sync and your training status will show up here.'}
              </Text>
            </View>

            {/* 2 — the Gap: hold-flat / you / gap chips, definition in tooltip */}
            {gapInfo ? (
              <DetailBlock label="The gap" hint={gapInfo.tooltip.join(' ')}>
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

            {/* 3 — zone balance: bar + flagged chips, sentences in tooltips */}
            {zoneChips.length > 0 && zones ? (
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
                <View style={s.chipRow}>
                  {zoneChips.map((chip) => (
                    <FlagChip key={chip.id} chip={chip} />
                  ))}
                </View>
              </DetailBlock>
            ) : null}

            {/* 4 — fitness: CTL + ATL with weekly delta chips */}
            {trend ? (
              <DetailBlock label="Fitness">
                <View style={s.miniRow}>
                  {fitnessTiles(trend).map((tile) => (
                    <StatTile key={tile.id} size="sm" {...tile} style={s.miniTile} />
                  ))}
                </View>
              </DetailBlock>
            ) : null}

            {/* 5 — recovery: HRV / RHR / sleep 7-day tiles */}
            {recoveryTilesList.length > 0 ? (
              <DetailBlock label="Recovery · 7-day">
                <View style={s.miniRow}>
                  {recoveryTilesList.map((tile) => (
                    <StatTile key={tile.id} size="sm" {...tile} style={s.miniTile} />
                  ))}
                </View>
              </DetailBlock>
            ) : null}
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
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

const styles = (p: Palette) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: p.overlay,
      justifyContent: 'flex-end',
    },
    sheet: {
      width: '100%',
      maxHeight: '88%',
      backgroundColor: p.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.sm,
    },
    // userSelect:'none' is web-only: a mouse drag on the head must not start a
    // text selection (it would kill the pan gesture).
    handleRow: { alignItems: 'center', minHeight: 32, userSelect: 'none' },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: p.borderStrong,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
    title: { color: p.text, fontSize: fontSize.h, fontWeight: '700', flexShrink: 1 },
    spring: { flex: 1 },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: spacing.md, gap: spacing.md },
    // --- coach bubble (spec §1): avatar + status paragraph ---
    coachStrip: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
    coachAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.borderGlass,
    },
    coachText: {
      color: p.text,
      fontSize: fontSize.small,
      lineHeight: lineHeight.small + 3,
      fontWeight: '600',
      flexShrink: 1,
      fontVariant: ['tabular-nums'],
    },
    // --- detail blocks ---
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
