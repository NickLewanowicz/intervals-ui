/**
 * UI primitives (StyleSheet only, no UI kit). Every color comes from the
 * active palette via useTheme(); styles are factories so theme switches
 * re-style live. Structure + states + glass-era polish (soft radius, 44pt
 * targets, springy press feedback via PressableScale).
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { PressableScale } from '@/components/motion';
import { GlassCard } from '@/components/glass';
import { InfoHint } from '@/components/Hint';
import { fontSize, layout, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Ionicons ink draws slightly high relative to text ink inside the same
 * control (round-3 audit RC2) — measured 0.5-1px vs label ink centers, so
 * the optical correction lives here ONCE, never per call-site.
 */
const ICON_NUDGE_EM = 0.06;

/** Shared icon for interactive controls (buttons, toggles, tab items). */
export function Icon({
  name,
  size,
  color,
  style,
}: {
  name: IconName;
  size: number;
  color: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={[{ transform: [{ translateY: size * ICON_NUDGE_EM }] }, style]}
    />
  );
}

/** Scrollable screen body. (FIX-2: tab scenes clip content, so every screen
 *  scrolls through THIS or its own ScrollView — never a plain View.) */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.screenContent, style]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Raised surface card. */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <GlassCard style={style}>{children}</GlassCard>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return <Text style={styles(colors).sectionTitle}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const textColor = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={[s.button, variant === 'primary' && s.buttonPrimary, variant === 'ghost' && s.buttonGhost, variant === 'danger' && s.buttonDanger, (disabled || loading) && s.buttonDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <View style={s.buttonInner}>
          {icon ? <Icon name={icon} size={17} color={textColor} /> : null}
          <Text style={[s.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </PressableScale>
  );
}

/** Round icon button (nav arrows, sync, eye, send). `compact` shrinks the
 *  visual to ~34-36px for dense chrome while hitSlop keeps the 44pt target. */
export function IconButton({
  icon,
  onPress,
  label,
  tone = 'ghost',
  size = 20,
  disabled,
  loading,
  hitSlop,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  label: string;
  tone?: 'ghost' | 'accent' | 'danger';
  size?: number;
  disabled?: boolean;
  loading?: boolean;
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const color = tone === 'accent' ? colors.onAccent : tone === 'danger' ? colors.danger : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[s.iconButton, tone === 'accent' && { backgroundColor: colors.accent, borderColor: colors.accent }, (disabled || loading) && s.buttonDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <Icon name={icon} size={size} color={color} />
      )}
    </PressableScale>
  );
}

export function Badge({
  label,
  tone = 'muted',
  icon,
}: {
  label: string;
  tone?: 'muted' | 'accent' | 'danger' | 'race' | 'success';
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const toneColor =
    tone === 'danger' ? colors.danger : tone === 'race' ? colors.race : tone === 'accent' ? colors.accentText : tone === 'success' ? colors.success : colors.muted;
  return (
    <View style={[s.badge, tone !== 'muted' && { borderColor: toneColor, backgroundColor: tone === 'race' ? colors.race : 'transparent' }]}>
      {icon ? <Ionicons name={icon} size={11} color={tone === 'race' ? colors.bg : toneColor} /> : null}
      <Text style={[s.badgeText, { color: tone === 'race' ? colors.bg : toneColor }]}>{label}</Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label?: string; hint?: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  const [reveal, setReveal] = useState(false);
  const isSecret = inputProps.secureTextEntry === true;
  return (
    <View style={s.field}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <View style={s.inputRow}>
        <TextInput
          placeholderTextColor={colors.muted}
          {...inputProps}
          secureTextEntry={isSecret && !reveal}
          style={[s.input, inputProps.multiline && s.inputMultiline, inputProps.style]}
        />
        {isSecret ? (
          // hold to reveal — never persists (FIX-8)
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={reveal ? 'Hide key' : 'Show key while pressed'}
            onPressIn={() => setReveal(true)}
            onPressOut={() => setReveal(false)}
            style={s.eyeBtn}
            hitSlop={6}
          >
            <Icon name={reveal ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.stateBox}>
      <ActivityIndicator size="small" color={colors.muted} />
      <Text style={s.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.stateBox}>
      <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
      <Text style={s.errorText}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ message, icon }: { message: string; icon?: IconName }) {
  const { colors } = useTheme();
  const s = styles(colors);
  return (
    <View style={s.stateBox}>
      {icon ? <Ionicons name={icon} size={30} color={colors.muted} /> : null}
      <Text style={s.stateText}>{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatTile (design spec calendar-home-v2 §2): icon? + small-caps muted label
// + BIG tabular value + sub-chip (colored text + small directional Ionicon —
// never a bare unicode arrow). `lg` = hero strip, `sm` = drawer mini-tiles.
// Pure shape comes from @/lib/stats-view TileModel.
// ---------------------------------------------------------------------------

export type TileTone = 'better' | 'worse' | 'neutral';

export interface StatTileSub {
  text: string;
  tone: TileTone;
  /** Directional icon: up / down / remove (flat). No icon when omitted. */
  dir?: 'up' | 'down' | 'flat';
  /** Planned/target value — rendered with a flag icon instead of a word. */
  planned?: boolean;
}

const SUB_ICON: Record<NonNullable<StatTileSub['dir']>, IconName> = {
  up: 'arrow-up',
  down: 'arrow-down',
  flat: 'remove',
};

export function StatTile({
  icon,
  label,
  value,
  valueTone,
  sub,
  hint,
  size = 'lg',
  style,
  testID,
}: {
  icon?: IconName;
  label: string;
  value: string;
  /** Value ink tone (e.g. form band); default = text color. */
  valueTone?: TileTone;
  sub?: StatTileSub | null;
  /** Tooltip content rendered as an info-i hint beside the label. */
  hint?: string | React.ReactNode;
  size?: 'lg' | 'sm';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const s = styles(colors);
  const toneColor = sub?.tone === 'better' ? colors.success : sub?.tone === 'worse' ? colors.danger : colors.muted;
  const valueColor =
    valueTone === 'better' ? colors.success : valueTone === 'worse' ? colors.danger : colors.text;
  return (
    <View style={[s.tile, size === 'sm' && s.tileSm, style]} testID={testID}>
      <View style={s.tileLabelRow}>
        {icon ? <Icon name={icon} size={size === 'sm' ? 12 : 13} color={colors.muted} /> : null}
        <Text style={size === 'sm' ? s.tileLabelSm : s.tileLabel}>{label}</Text>
        {hint ? <InfoHint content={hint} label={`About ${label}`} size={size === 'sm' ? 13 : 14} /> : null}
      </View>
      <Text style={[size === 'sm' ? s.tileValueSm : s.tileValue, { color: valueColor }]} numberOfLines={1}>
        {value}
      </Text>
      {sub ? (
        <View style={s.tileSubRow}>
          {sub.planned ? (
            <Ionicons
              name="flag"
              size={size === 'sm' ? 9 : 10}
              color={toneColor}
            />
          ) : null}
          {sub.dir ? (
            <Ionicons
              name={SUB_ICON[sub.dir]}
              size={size === 'sm' ? 10 : 11}
              color={toneColor}
            />
          ) : null}
          <Text style={[size === 'sm' ? s.tileSubSm : s.tileSub, { color: toneColor }]} numberOfLines={1}>
            {sub.text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = (p: Palette) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg },
    screenContent: {
      maxWidth: layout.maxW,
      width: '100%',
      alignSelf: 'center',
      padding: spacing.lg,
      // clear the floating glass tab bar
      paddingBottom: spacing.xxxl + layout.tabBarHeight,
      gap: spacing.md,
    },
    sectionTitle: {
      color: p.muted,
      fontSize: fontSize.small,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: spacing.sm,
    },
    button: {
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      minHeight: layout.minTouch,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.card,
    },
    buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    buttonPrimary: { backgroundColor: p.accent, borderColor: p.accent },
    buttonGhost: { backgroundColor: p.card },
    buttonDanger: { backgroundColor: p.card, borderColor: p.danger },
    buttonDisabled: { opacity: 0.45 },
    buttonText: { fontSize: fontSize.body, fontWeight: '600' },
    iconButton: {
      width: layout.minTouch,
      height: layout.minTouch,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      backgroundColor: p.card,
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: radius.pill,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
      paddingHorizontal: 8,
      paddingVertical: 2,
      alignSelf: 'flex-start',
    },
    badgeText: { fontSize: fontSize.tiny, color: p.muted, fontWeight: '700', letterSpacing: 0.4 },
    field: { gap: spacing.xs },
    fieldLabel: { color: p.muted, fontSize: fontSize.small },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    input: {
      flexGrow: 1,
      flexShrink: 1,
      backgroundColor: p.bg,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      color: p.text,
      fontSize: fontSize.body,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 3,
      minHeight: layout.minTouch,
    },
    inputMultiline: { minHeight: 110, textAlignVertical: 'top' },
    eyeBtn: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center' },
    hint: { color: p.muted, fontSize: fontSize.tiny },
    stateBox: {
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.xl,
      backgroundColor: p.card,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: p.border,
    },
    stateText: { color: p.muted, fontSize: fontSize.body, textAlign: 'center' },
    errorText: { color: p.danger, fontSize: fontSize.body, textAlign: 'center' },
    // --- StatTile (design spec §2) ---
    tile: { gap: 2, flexShrink: 1, minWidth: 0 },
    tileSm: { gap: 1 },
    tileLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    tileLabel: {
      color: p.muted,
      fontSize: fontSize.tiny,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      flexShrink: 1,
    },
    tileLabelSm: {
      color: p.muted,
      fontSize: fontSize.tiny - 1,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      flexShrink: 1,
    },
    tileValue: {
      color: p.text,
      fontSize: 22,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    tileValueSm: {
      color: p.text,
      fontSize: fontSize.small + 2,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    tileSubRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    tileSub: {
      fontSize: fontSize.tiny + 1,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    tileSubSm: {
      fontSize: fontSize.tiny,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
  });
