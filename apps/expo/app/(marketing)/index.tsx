/**
 * WEB-ONLY marketing splash (V-01): Hero → 80/20 anchor → training science →
 * how it works → disclaimer. Native builds never land here — the redirect
 * below sends them straight to /sign-in, while the static web export keeps
 * this route for the deployed site.
 *
 * HERO BACKGROUND STACK (round-6 repair) — strict paint order, no gaps:
 *   1. base color  — palette `bg` on the hero container itself;
 *   2. mesh image  — generated mesh (bg-dark/bg-light by scheme), `cover`;
 *   3. scrim       — LinearGradient (bg-tinted, ~85-90% alpha → solid bg)
 *     absolutely filling the hero so it covers at ANY viewport height and
 *     melts seamlessly into the page background below;
 *   4. content     — last in DOM, paints above the scrim.
 * The scrim strength is derived from the mesh's measured luminance range so
 * every text class clears WCAG AA against the COMPOSITED background in both
 * themes (see qa round-6 report); hero muted copy uses `mutedStrong`.
 *
 * SOURCING (round-6 copy swap): the page credits the science rather than
 * promoting books — Fitzgerald for popularizing 80/20, Daniels for VDOT,
 * post-sub-2 fueling practice — with the coach framed as synthesizing many
 * public sources onto the user's intervals.icu data.
 *
 * LOCAL-MODE PLAN (docs/research/local-mode.md): today the web deployment is
 * Cloudflare Pages + the coach Worker. A future "local mode" would serve this
 * same web export from the worker (or `npx expo start --web`) on localhost so
 * the app runs fully self-hosted; nothing in this file may assume Cloudflare.
 */
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
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

/** Sourcing credits — principles and the people behind them, not book promos. */
const SCIENCE: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; name: string; body: string }> = [
  {
    icon: 'stats-chart-outline',
    name: 'Polarized / 80/20 training',
    body: 'popularized by Matt Fitzgerald; rooted in Stephen Seiler’s published research on elite intensity distribution.',
  },
  {
    icon: 'speedometer-outline',
    name: 'VDOT pace systems',
    body: 'Jack Daniels’ laboratory-derived framework for training and race paces.',
  },
  {
    icon: 'nutrition-outline',
    name: 'Modern race fueling',
    body: 'current high-carbohydrate fueling practice from the post-sub-2:00 marathon era.',
  },
];

export default function MarketingPage() {
  const { colors, isDark } = useTheme();
  const s = styles(colors);
  const { easy, fast } = intensity(colors);

  // Hydration self-heal: the static prerender cannot know the OS scheme, so a
  // dark-OS client hydrates a LIGHT-painted DOM. React adopts prerendered
  // styles during hydration and diffs against the fiber (already dark), so it
  // never re-applies them — only freshly-mounted layers (the mesh image) get
  // client values, i.e. dark mesh under a light scrim. If the painted hero
  // background disagrees with the resolved palette, remount once so the whole
  // tree repaints from the client palette. (App-wide prerender issue; this is
  // the page-scoped guard for the splash route.)
  const [treeNonce, setTreeNonce] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = document.querySelector('[data-testid="hero-bg"]');
    if (!el) return;
    const painted = getComputedStyle(el).backgroundColor.replace(/\s/g, '');
    if (painted !== `rgb(${rgbDigits(colors.bg)})`) setTreeNonce(1);
    // Run once after hydration; colors.bg is stable for the resolved scheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native builds open directly on sign-in; this route is for the web deploy.
  useEffect(() => {
    if (Platform.OS !== 'web') router.replace('/sign-in');
  }, []);

  if (Platform.OS !== 'web') return null;

  return (
    <ScrollView key={treeNonce} style={s.page} contentContainerStyle={s.content}>
      {/* ── Hero: base → mesh cover → scrim → content ──────────────────────
          The hero container (heroBg) owns the base color, clipping and the
          stacking context; the mesh and scrim are absolute-fill layers under
          the content. ImageBackground is childless so RNW's odd internals
          (z:-1 wrapper sized to the image's natural height) stay contained. */}
      <View style={s.heroBg} testID="hero-bg">
        <ImageBackground
          key={isDark ? 'mesh-dark' : 'mesh-light'}
          source={isDark ? BG_DARK : BG_LIGHT}
          style={s.mesh}
          imageStyle={s.heroImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        <LinearGradient
          colors={[tint(colors.bg, 0.85), tint(colors.bg, 0.9), colors.bg]}
          style={s.scrim}
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
      </View>

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
            <Text style={s.splitLabel}>80 · easy aerobic</Text>
            <Text style={s.splitLabel}>20 · quality</Text>
          </View>
        </GlassCard>
      </View>

      {/* ── Grounded in training science — credit the sources, not promos ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Grounded in training science</Text>
        <Text style={s.sectionLead}>
          The coach doesn’t invent its method — it applies the most widely-supported findings in
          endurance science to your data.
        </Text>
        {SCIENCE.map((src) => (
          <GlassCard key={src.name} style={s.creditCard}>
            <View style={s.creditIcon}>
              <Ionicons name={src.icon} size={18} color={colors.accentText} />
            </View>
            <Text style={s.creditBody}>
              <Text style={s.creditName}>{src.name}</Text> — {src.body}
            </Text>
          </GlassCard>
        ))}
        <Text style={s.sectionFoot}>
          Everything above is applied to your intervals.icu data — your zones, your fitness, your
          races — and every plan is yours to approve.
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
            <View style={s.stepCopy}>
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

/** bg with alpha as an rgba string (LinearGradient needs color strings). */
function tint(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** hex as a getComputedStyle backgroundColor digit triple ("11,14,21"). */
function rgbDigits(hex: string): string {
  const h = hex.replace('#', '');
  return `${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)}`;
}

const styles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg },
    content: { alignItems: 'center', gap: spacing.xxl, paddingBottom: spacing.xxl },
    // 1. base color — the hero container carries the palette bg UNDER the mesh
    //    image. RNW renders the mesh layer as an absolutely-positioned z:-1
    //    child sized to the image's NATURAL height, so this container must be
    //    positioned with zIndex 0 (containing block + stacking context) and
    //    clip overflow; the layer would otherwise bleed past the hero.
    heroBg: {
      width: '100%',
      backgroundColor: p.bg,
      position: 'relative',
      zIndex: 0,
      overflow: 'hidden',
      alignItems: 'center',
    },
    // 2. mesh image layer — childless ImageBackground, absolute fill.
    mesh: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    //    Kept visible but capped so the scrim (3) owns legibility.
    heroImg: { opacity: 0.55 },
    // 3. scrim — absolute fill: covers at any viewport height, melts into bg.
    scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    // 4. content — last in paint order, above the scrim.
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
      color: p.mutedStrong,
      fontSize: fontSize.body + 2,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 480,
    },
    ctaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm },
    cta: { minWidth: 148 },
    eightyTwenty: { width: '100%', maxWidth: 640, alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
    overline: {
      color: p.muted,
      fontSize: fontSize.small,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      textAlign: 'center',
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
    // Zone colors stay on the BAR (data); labels read as plain muted text (AA).
    splitLabel: { color: p.muted, fontSize: fontSize.tiny, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    // Sections are centered columns; cards fill the column, card interiors
    // left-align consistently (rows with an icon read better that way).
    section: { width: '100%', maxWidth: 640, alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
    sectionTitle: {
      color: p.text,
      fontSize: fontSize.h,
      lineHeight: lineHeight.h,
      fontWeight: '800',
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    sectionLead: {
      color: p.muted,
      fontSize: fontSize.body,
      lineHeight: lineHeight.body,
      textAlign: 'center',
      maxWidth: 520,
    },
    creditCard: { width: '100%', flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
    creditIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    creditBody: { flex: 1, color: p.muted, fontSize: fontSize.small, lineHeight: 19, marginTop: 1 },
    creditName: { color: p.text, fontWeight: '700' },
    sectionFoot: {
      color: p.muted,
      fontSize: fontSize.small,
      lineHeight: 19,
      textAlign: 'center',
      maxWidth: 520,
      marginTop: spacing.xs,
    },
    step: { width: '100%', flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
    stepIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.sm + 2,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepCopy: { flex: 1 },
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
      color: p.mutedStrong,
      fontSize: fontSize.tiny,
      textAlign: 'center',
      lineHeight: 16,
      paddingHorizontal: spacing.xl,
    },
  });
