/**
 * Glass primitives — the viet-study chrome translated to native patterns:
 * translucent blurred surfaces with a 1px light hairline, soft diffuse depth.
 *
 * - Native: expo-blur BlurView (+ a palette tint for legibility).
 * - Web: BlurView's built-in web tints are neutral grays (off-palette), so we
 *   render a View with the palette's translucent surface + backdrop-filter
 *   inline styles instead — same recipe the viet nav uses
 *   (rgba surface + blur(10-24px) saturate).
 */
import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadows, spacing } from '@/theme';
import { useTheme } from '@/theme-context';

/** Web-only inline backdrop styles (not expressible in RN ViewStyle types). */
const WEB_BACKDROP = {
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
} as unknown as ViewStyle;

export function GlassSurface({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, isDark } = useTheme();
  if (Platform.OS === 'web') {
    return (
      <View style={[{ backgroundColor: colors.glass }, WEB_BACKDROP, style]}>{children}</View>
    );
  }
  return (
    <BlurView
      intensity={isDark ? 45 : 65}
      tint={isDark ? 'dark' : 'light'}
      style={[{ backgroundColor: colors.glass }, style]}
    >
      {children}
    </BlurView>
  );
}

/** Raised card: solid surface, hairline border, soft diffuse shadow. */
export function GlassCard({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

/**
 * Full-bleed chrome bar (top headers, chat input dock, tab bar). `edge`
 * places the hairline toward the content; `floating` gets viet's pill look
 * (inset, big radius, diffuse shadow) instead of edge-to-edge.
 */
export function GlassBar({
  children,
  style,
  edge = 'bottom',
  floating = false,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edge?: 'top' | 'bottom' | 'none';
  floating?: boolean;
}) {
  const { colors } = useTheme();
  const hairline =
    edge === 'top'
      ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderGlass }
      : edge === 'bottom'
        ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderGlass }
        : null;
  return (
    <GlassSurface
      style={[
        hairline,
        floating
          ? [styles.floatingBar, { borderColor: colors.borderGlass }, shadows(colors).bar]
          : null,
        style,
      ]}
    >
      {children}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  floatingBar: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
