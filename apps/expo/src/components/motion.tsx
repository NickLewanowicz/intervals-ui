/**
 * Motion primitives (react-native Animated only — no library):
 * - PressableScale: springy press feedback on cards/buttons.
 * - TypingDots: the coach-is-thinking ellipsis while streaming.
 * - SlideFadeIn: re-plays a short slide+fade when `dep` changes (week/month
 *   switches). Respects reduced motion via AccessibilityInfo on web where
 *   the API exists; keeps durations ≤200ms per the motion spec.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  type AccessibilityProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { motion } from '@/theme';

/**
 * One animated node: the Pressable IS the layout box, the paint box AND the
 * hit area (round-3 audit RC1 — a styled wrapper around a bare Pressable
 * pinned children to the top and shrink-wrapped the hit area). The only style
 * PressableScale adds is the press transform.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressableScale({
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  hitSlop,
  style,
  disabled,
  scaleTo = motion.pressScale,
  children,
  ...accessibility
}: {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  /** Extends the touch target without growing the visual (compact chrome). */
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  scaleTo?: number;
  children?: React.ReactNode;
} & AccessibilityProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const springTo = (to: number) =>
    Animated.spring(scale, {
      toValue: to,
      friction: to < 1 ? motion.pressSpring.friction : motion.releaseSpring.friction,
      tension: to < 1 ? motion.pressSpring.tension : motion.releaseSpring.tension,
      useNativeDriver: true,
    }).start();

  return (
    <AnimatedPressable
      accessibilityRole={accessibility.accessibilityRole ?? 'button'}
      accessibilityLabel={accessibility.accessibilityLabel}
      accessibilityHint={accessibility.accessibilityHint}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        onPressIn?.();
        springTo(disabled ? 1 : scaleTo);
      }}
      onPressOut={() => {
        onPressOut?.();
        springTo(1);
      }}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}

/** Three staggered breathing dots — shown while the coach is streaming. */
export function TypingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current, useRef(new Animated.Value(0.35)).current];

  useEffect(() => {
    const anims = dots.map((d, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(d, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(d, { toValue: 0.35, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // dots refs are stable for the component lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={styles.dots}>
      {dots.map((d, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: d }]} />
      ))}
    </Animated.View>
  );
}

/**
 * Slide+fade that replays whenever `dep` changes. `direction` (-1 | 1) sets
 * the slide origin (back/forward); 0 = pure fade. First mount animates once.
 */
export function SlideFadeIn({
  dep,
  direction = 1,
  children,
  style,
}: {
  dep: string | number;
  direction?: -1 | 0 | 1;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    if (first.current && typeof dep === 'string') {
      // still animate the first appearance — it doubles as data-load fade-in
      first.current = false;
    }
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.pageSlide,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (!cancelled) progress.setValue(1);
    });
    return () => {
      cancelled = true;
    };
  }, [dep, direction, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [14 * direction, 0],
  });
  const opacity = progress;

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateX }] }]}>{children}</Animated.View>
  );
}

/** True when the OS asks for reduced motion (best-effort, defaults to false). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduced).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => sub?.remove();
  }, []);
  return reduced;
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center', paddingVertical: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
