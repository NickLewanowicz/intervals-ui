/**
 * Splash / product page. Static, grayscale, no data.
 */
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import { colors, fontSize, radius, spacing } from '@/theme';

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '1',
    title: 'Connect intervals.icu',
    body: 'Your calendar, activities and fitness trend are mirrored automatically.',
  },
  {
    n: '2',
    title: 'Chat with your coach',
    body: 'An AI coach that sees your plan, history and fatigue — and proposes changes.',
  },
  {
    n: '3',
    title: 'Approve changes on your calendar',
    body: 'Nothing is written without you. Review each proposal, then apply or dismiss.',
  },
];

export default function MarketingPage() {
  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <Text style={styles.headline}>Your training, coached.</Text>
        <Text style={styles.sub}>
          A simplified view of your intervals.icu with an AI coach that plans — and you approve
          every change.
        </Text>
        <View style={styles.ctaRow}>
          <Link href="/sign-in" asChild>
            <PressableSlot label="Get started" />
          </Link>
          <Link href="/sign-in" asChild>
            <PressableSlot label="Sign in" variant="ghost" />
          </Link>
        </View>
      </View>

      <View style={styles.stepsWrap}>
        <Text style={styles.stepsTitle}>How it works</Text>
        {STEPS.map((s) => (
          <View key={s.n} style={styles.step}>
            <Text style={styles.stepN}>{s.n}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepTitle}>{s.title}</Text>
              <Text style={styles.stepBody}>{s.body}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Bridge so <Button/> can live inside a <Link asChild>. */
function PressableSlot({ label, variant }: { label: string; variant?: 'ghost' }) {
  return (
    <View>
      <Button title={label} variant={variant ?? 'primary'} style={{ minWidth: 140 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xxl,
  },
  hero: { maxWidth: 560, alignItems: 'center', gap: spacing.lg },
  headline: {
    color: colors.text,
    fontSize: fontSize.title + 6,
    fontWeight: '700',
    textAlign: 'center',
  },
  sub: {
    color: colors.muted,
    fontSize: fontSize.body + 1,
    textAlign: 'center',
    lineHeight: 24,
  },
  ctaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  stepsWrap: { maxWidth: 560, width: '100%', gap: spacing.md },
  stepsTitle: {
    color: colors.muted,
    fontSize: fontSize.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  step: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  stepN: {
    color: colors.accent,
    fontSize: fontSize.h,
    fontWeight: '700',
    width: 28,
  },
  stepTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: '600' },
  stepBody: { color: colors.muted, fontSize: fontSize.small, lineHeight: 19, marginTop: 2 },
});
