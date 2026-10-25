/**
 * WEB-ONLY marketing splash (V-01): Hero → 80/20 anchor → books → how it
 * works → disclaimer. Native builds never land here — the redirect below
 * sends them straight to /sign-in, while the static web export keeps this
 * route for the deployed site.
 *
 * LOCAL-MODE PLAN (docs/research/local-mode.md): today the web deployment is
 * Cloudflare Pages + the coach Worker. A future "local mode" would serve this
 * same web export from the worker (or `npx expo start --web`) on localhost so
 * the app runs fully self-hosted; nothing in this file may assume Cloudflare.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { ImageBackground, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GlassCard } from '@/components/glass';
import { PressableScale } from '@/components/motion';
import { Button } from '@/components/ui';
import { fontSize, intensity, layout, lineHeight, radius, spacing, type Palette } from '@/theme';
import { useTheme } from '@/theme-context';

const BG_DARK = require('@/assets/bg-dark.jpg');
const BG_LIGHT = require('@/assets/bg-light.jpg');

const STEPS: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }> = [
  {
    icon: 'link-outline',
    title: 'Connect intervals.icu',
    body: 'Your calendar, activities and fitness trend are mirrored automatically.',
  },
  {
    icon: 'chatbubbles-outline',
    title: 'Chat with your coach',
    body: 'An AI coach that sees your plan, history and fatigue — and proposes changes.',
  },
  {
    icon: 'checkmark-circle-outline',
    title: 'Approve changes on your calendar',
    body: 'Nothing is written without you. Review each proposal, then apply or dismiss.',
  },
];

const BOOKS: Array<{ title: string; authors: string; note: string }> = [
  {
    title: '80/20 Running',
    authors: 'Matt Fitzgerald & David Johnson',
    note: 'The polarized training distribution the coach plans around.',
  },
  {
    title: 'Run Like a Pro (Even If You’re Slow)',
    authors: 'Matt Fitzgerald & Ben Rosario',
    note: 'How elite habits — structure, consistency, recovery — translate to everyday runners.',
  },
];

export default function MarketingPage() {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const { easy, fast } = intensity(colors);

  // Native builds open directly on sign-in; this route is for the web deploy.
  useEffect(() => {
    if (Platform.OS !== 'web') router.replace('/sign-in');
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <ImageBackground
        source={isDark ? BG_DARK : BG_LIGHT}
        style={s.heroBg}
        imageStyle={s.heroImg}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      >
        <LinearGradient
          colors={[transparent(colors.bg), colors.bg]}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <View style={s.heroInner}>
          <View style={s.brandRow}>
            <View style={s.brandMark}>
              <Ionicons name="flash" size={18} color={colors.onAccent} />
            </View>
            <Text style={s.brandName}>intervals</Text>
          </View>
          <Text style={s.headline}>Your training, coached.</Text>
          <Text style={s.sub}>
            A simplified view of your intervals.icu — with an AI coach that plans, and you approve
            every change.
          </Text>
          <View style={s.ctaRow}>
            <Button title="Get started" icon="arrow-forward" onPress={() => router.push('/sign-in')} style={s.cta} />
            <Button
              title="Sign in"
              variant="ghost"
              onPress={() => router.push('/sign-in')}
              style={s.cta}
            />
          </View>
        </View>
      </ImageBackground>

      {/* ── 80/20 anchor — the product idea, given the most weight (FIX-5) ── */}
      <View style={s.eightyTwenty}>
        <Text style={s.overline}>The method</Text>
        <Text style={s.eightyTitle}>
          80% easy.{'\n'}20% fast.
        </Text>
        <Text style={s.eightyBody}>
          Elite distance runners do roughly 80% of their training at an easy, conversational pace —
          and only about 20% as quality work. That polarized distribution is the closest thing the
          running literature has to a law. Your coach keeps your week inside it, scaled to your
          current fitness and your goals, and shows its work.
        </Text>
        <GlassCard style={s.splitCard}>
          <View style={s.splitBar}>
            <View style={[s.splitEasy, { backgroundColor: easy }]} />
            <View style={[s.splitFast, { backgroundColor: fast }]} />
          </View>
          <View style={s.splitLabels}>
            <Text style={[s.splitLabelEasy, { color: easy }]}>80 · easy aerobic</Text>
            <Text style={[s.splitLabelFast, { color: fast }]}>20 · quality</Text>
          </View>
        </GlassCard>
      </View>

      {/* ── Where the coaching comes from ────────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.overline}>Where the coaching comes from</Text>
        {BOOKS.map((b) => (
          <GlassCard key={b.title} style={s.bookCard}>
            <View style={s.bookIcon}>
              <Ionicons name="book-outline" size={18} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.bookTitle}>{b.title}</Text>
              <Text style={s.bookAuthors}>{b.authors}</Text>
              <Text style={s.bookNote}>{b.note}</Text>
            </View>
          </GlassCard>
        ))}
        <Text style={s.booksFoot}>
          Distilled into the coach's guidance — principles, not passages.
        </Text>
      </View>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <View style={s.section}>
        <Text style={s.overline}>How it works</Text>
        {STEPS.map((step, i) => (
          <GlassCard key={step.title} style={s.step}>
            <View style={s.stepIcon}>
              <Ionicons name={step.icon} size={18} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>
                {i + 1} · {step.title}
              </Text>
              <Text style={s.stepBody}>{step.body}</Text>
            </View>
          </GlassCard>
        ))}
      </View>

      {/* ── CTA + disclaimer ─────────────────────────────────────────────── */}
      <View style={s.footerCta}>
        <PressableScale
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          accessibilityLabel="Start coaching"
          style={s.footerCtaHit}
        >
          <Text style={s.footerCtaText}>Ready? Your training, coached →</Text>
        </PressableScale>
      </View>
      <Text style={s.disclaimer}>
        Educational guidance distilled from training literature and your own data — not medical or
        professional advice. If something hurts, see a professional, not a plan tweak. Always do
        your own due diligence.
      </Text>
    </ScrollView>
  );
}

/** bg → transparent as rgba strings (LinearGradient needs color strings). */
function transparent(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, 0)`;
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    content: { alignItems: 'center', gap: spacing.xxl, paddingBottom: spacing.xxl },
    heroBg: { width: '100%', alignItems: 'center' },
    heroImg: { opacity: 0.9 },
    heroInner: {
      width: '100%',
      maxWidth: 640,
      alignItems: 'center',
      gap: spacing.lg,
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xxxl + spacing.xl,
      paddingBottom: spacing.xxxl,
    },
    brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    brandMark: {
      width: 30,
      height: 30,
      borderRadius: radius.sm + 2,
      backgroundColor: p.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    brandName: { color: p.text, fontSize: fontSize.body, fontWeight: '700', letterSpacing: 0.3 },
    headline: {
      color: p.text,
      fontSize: fontSize.display,
      lineHeight: lineHeight.display,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    sub: {
      color: p.muted,
      fontSize: fontSize.body + 2,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 480,
    },
    ctaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
    cta: { minWidth: 148 },
    eightyTwenty: { width: '100%', maxWidth: 640, alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
    overline: {
      color: p.muted,
      fontSize: fontSize.small,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    eightyTitle: {
      color: p.text,
      fontSize: 44,
      lineHeight: 50,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -1,
    },
    eightyBody: {
      color: p.muted,
      fontSize: fontSize.body + 1,
      lineHeight: 25,
      textAlign: 'center',
      maxWidth: 520,
    },
    splitCard: { width: '100%', padding: spacing.lg, gap: spacing.sm },
    splitBar: {
      flexDirection: 'row',
      height: 18,
      borderRadius: radius.md,
      overflow: 'hidden',
      gap: 2,
    },
    splitEasy: { flexGrow: 80, borderRadius: radius.sm },
    splitFast: { flexGrow: 20, borderRadius: radius.sm },
    splitLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    splitLabelEasy: { fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    splitLabelFast: { fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    section: { width: '100%', maxWidth: 560, gap: spacing.md, paddingHorizontal: spacing.xl },
    bookCard: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    bookIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    bookTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '700' },
    bookAuthors: { color: p.accentText, fontSize: fontSize.small, marginTop: 1 },
    bookNote: { color: p.muted, fontSize: fontSize.small, lineHeight: 18, marginTop: 3 },
    booksFoot: { color: p.muted, fontSize: fontSize.small, textAlign: 'center', marginTop: spacing.xs },
    step: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepTitle: { color: p.text, fontSize: fontSize.body, fontWeight: '600' },
    stepBody: { color: p.muted, fontSize: fontSize.small, lineHeight: 19, marginTop: 2 },
    footerCta: { marginTop: spacing.sm },
    // F19: bare-text CTA had a 17.5px hit area — the control itself is the target
    footerCtaHit: {
      minHeight: layout.minTouch,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    footerCtaText: { color: p.accentText, fontSize: fontSize.body, fontWeight: '700' },
    disclaimer: {
      maxWidth: 560,
      color: p.muted,
      fontSize: fontSize.tiny,
      textAlign: 'center',
      lineHeight: 16,
      opacity: 0.85,
      paddingHorizontal: spacing.xl,
    },
  });
