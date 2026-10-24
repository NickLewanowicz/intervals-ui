/**
 * Grayscale UI primitives (StyleSheet only, no UI kit). Structure + states,
 * not final art — the vision pass restyles via theme tokens.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { colors, fontSize, radius, spacing } from '@/theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, style]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'primary' && styles.buttonPrimaryText,
            variant !== 'primary' && { color: colors.text },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Badge({
  label,
  tone = 'muted',
}: {
  label: string;
  tone?: 'muted' | 'accent' | 'danger';
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'danger' && styles.badgeDanger,
        tone === 'accent' && styles.badgeAccent,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === 'danger' && { color: colors.danger },
          tone === 'accent' && { color: colors.accent },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        {...inputProps}
        style={[styles.input, inputProps.multiline && styles.inputMultiline, inputProps.style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <View style={styles.stateBox}>
      <ActivityIndicator size="small" color={colors.muted} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? <Button title="Retry" variant="ghost" onPress={onRetry} /> : null}
    </View>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <View style={styles.stateBox}>
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  screenContent: {
    maxWidth: 860,
    width: '100%',
    alignSelf: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: fontSize.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },
  button: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  buttonPrimary: { backgroundColor: colors.accent, borderColor: colors.accent },
  buttonGhost: { backgroundColor: colors.card },
  buttonDanger: { backgroundColor: colors.card, borderColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.75 },
  buttonText: { fontSize: fontSize.body, fontWeight: '600' },
  buttonPrimaryText: { color: '#0d0d0f' },
  badge: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  badgeDanger: { borderColor: colors.danger },
  badgeAccent: { borderColor: colors.accent },
  badgeText: { fontSize: fontSize.tiny, color: colors.muted, fontWeight: '600' },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.muted, fontSize: fontSize.small },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSize.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minHeight: 42,
  },
  inputMultiline: { minHeight: 110, textAlignVertical: 'top' },
  hint: { color: colors.muted, fontSize: fontSize.tiny },
  stateBox: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  stateText: { color: colors.muted, fontSize: fontSize.body, textAlign: 'center' },
  errorText: { color: colors.danger, fontSize: fontSize.body, textAlign: 'center' },
});
