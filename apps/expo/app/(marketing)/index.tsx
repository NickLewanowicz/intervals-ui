/**
 * Splash / product page. Static, grayscale, no data. CTAs navigate to
 * /sign-in; the 80/20 section is a placeholder for issue V-01 (full product
 * story) — structure only for now.
 */
import { router } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.headline}>Your training, coached.</Text>
        <Text style={styles.sub}>
          A simplified view of your intervals.icu with an AI coach that plans — and you approve
          every change.
        </Text>
        <View style={styles.ctaRow}>
          <Button
            title="Get started"
            onPress={() => router.push('/sign-in')}
            style={styles.cta}
          />
          <Button
            title="Sign in"
            variant="ghost"
            onPress={() => router.push('/sign-in')}
            style={styles.cta}
          />
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

      <View style={styles.principles}>
        <Text style={styles.principlesTitle}>Built on 80/20 training principles</Text>
        <Text style={styles.principlesBody}>
          The coach plans from the distribution the running literature converges on — roughly 80%
          easy aerobic work to 20% quality — scaled to your current fitness and race goals.
        </Text>
        <Text style={styles.principlesBody}>
          Every suggestion cites the distilled training books and your own numbers, so the reasoning
          is always visible and never a black box.
        </Text>
      </View>

      <Text style={styles.disclaimer}>
        Educational guidance from distilled training literature and your own data — not medical
        advice; pain or injury means a professional, not a plan tweak.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: {
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.xxl,
  },
  hero: { maxWidth: 560, alignItems: 'center', gap: spacing.lg, marginTop: spacing.xxl },
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
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  cta: { minWidth: 140 },
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
  principles: {
    maxWidth: 560,
    width: '100%',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  principlesTitle: { color: colors.text, fontSize: fontSize.body, fontWeight: '700' },
  principlesBody: { color: colors.muted, fontSize: fontSize.small, lineHeight: 19 },
  disclaimer: {
    maxWidth: 560,
    color: colors.muted,
    fontSize: fontSize.tiny,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.8,
    marginBottom: spacing.sm,
  },
});
