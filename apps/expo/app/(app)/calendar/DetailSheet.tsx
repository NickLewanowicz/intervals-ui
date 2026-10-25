/**
 * DetailSheet (week-view v2 spec §3, mobile <900px + native) — the day
 * detail as a bottom sheet on the ProposalModal chassis: slide-up Modal,
 * grab handle, scrim (tap to close), plus drag-the-handle-to-close and an X.
 * Renders the SAME DayDetails as the desktop side panel; the /calendar/day
 * route stays reachable via "Open full". One detail at a time — switching
 * days re-targets the open sheet in place.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, IconButton } from '@/components/ui';
import { SlideFadeIn } from '@/components/motion';
import DayDetails from './DayDetails';
import { MONTHS, dayLabel } from '@/lib/dates';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';
import type { DayCell } from '@intervals/core';

/** Drag distance (px) past which a handle release closes the sheet. */
const CLOSE_DRAG = 110;
/** Min downward drag (px) before a fast release counts as a close fling. */
const FLING_MIN_DRAG = 12;
/** Scrim press slop (px): a release farther than this is a swipe, not a tap. */
const TAP_SLOP = 10;

export default function DetailSheet({
  date,
  cellFor,
  today,
  onClose,
}: {
  date: string;
  cellFor: (d: string) => DayCell;
  today: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const insets = useSafeAreaInsets();
  const drag = useRef(new Animated.Value(0)).current;
  // where the current scrim press started (swipe-vs-tap discrimination, BUG-2)
  const scrimPress = useRef<{ x: number; y: number } | null>(null);

  // re-open per day: reset any residual drag offset when the target changes
  useEffect(() => {
    drag.setValue(0);
  }, [date, drag]);

  const panResponder = useRef(
    PanResponder.create({
      // claim at touch start: the pan responder owns every touch that begins
      // in the head row — a Pressable wrapper here would claim the gesture
      // first and the drag would never engage (QA parity round 2, BUG-1) —
      // and claiming keeps head taps from bubbling to the scrim's close
      // press (the old stopPropagation job). Buttons inside still win the
      // negotiation (deepest-first), so "Open full" / X keep working.
      onStartShouldSetPanResponder: () => true,
      // a drag must not be hijacked: on web a mid-drag text selection or a
      // native scroll fires a termination request — deny it (nothing nested
      // under the head row legitimately needs to steal this gesture).
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

  return (
    <Modal
      transparent
      visible
      animationType="slide"
      onRequestClose={onClose}
      accessibilityLabel={`Day detail for ${dayLabel(date)}`}
    >
      <Pressable
        style={s.overlay}
        accessibilityLabel="Close day detail"
        onPressIn={(e) => {
          scrimPress.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
        }}
        onPress={(e) => {
          // Android fires the scrim press on release even after a long swipe
          // (QA parity round 2, BUG-2): honour it as a close-tap only when the
          // release lands within TAP_SLOP of where the press started. A press
          // with no recorded start is screen-reader activation — just close.
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
          testID="detail-sheet"
        >
          {/* handle row: drag to close (spec) — also the sheet's grab area */}
          <View style={s.handleRow} {...panResponder.panHandlers}>
            <View style={s.grabber} />
            <View style={s.head}>
              <Text accessibilityRole="header" style={s.title} numberOfLines={1}>
                {`${dayLabel(date)} ${MONTHS[Number(date.slice(5, 7)) - 1]!.slice(0, 3)}`}
              </Text>
              {date === today ? <Badge label="today" tone="accent" /> : null}
              <View style={s.spring} />
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`Open full day detail for ${dayLabel(date)}`}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/calendar/day', params: { date } });
                }}
                hitSlop={8}
                style={s.openFull}
              >
                <Text style={s.openFullText}>Open full</Text>
                <Ionicons name="open-outline" size={12} color={colors.accentText} />
              </Pressable>
              <IconButton icon="close" label="Close day detail" onPress={onClose} size={16} hitSlop={8} />
            </View>
          </View>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={s.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <SlideFadeIn key={date} dep={date} direction={0}>
              <DayDetails cell={cellFor(date)} today={today} />
            </SlideFadeIn>
          </ScrollView>
        </Animated.View>
      </Pressable>
    </Modal>
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
    // text selection — the browser selection would fire selectionchange and
    // kill the pan gesture (QA parity round 2, BUG-1 web half).
    handleRow: { alignItems: 'center', minHeight: layout.minTouch - 12, userSelect: 'none' },
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
    openFull: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: layout.minTouch - 16,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.sm,
    },
    openFullText: { color: p.accentText, fontSize: fontSize.small, fontWeight: '600' },
    scroll: { flexShrink: 1 },
    scrollContent: { paddingBottom: spacing.md },
  });
