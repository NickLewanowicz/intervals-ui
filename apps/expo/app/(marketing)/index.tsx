/**
 * WEB-ONLY marketing splash (V-01): Hero → "See it" screens showcase → 80/20
 * anchor → training science → how it works → disclaimer. Native builds never
 * land here — the redirect below sends them straight to /sign-in, while the
 * static web export keeps this route for the deployed site.
 *
 * SCREENS SHOWCASE (round 12): the hero makes a claim ("Your training,
 * coached"); the very next section proves it with real product screenshots
 * (apps/expo/src/assets/marketing — captured from the running app) imposed on
 * pure-CSS device frames (theme.device chrome): a MacBook center stage with
 * the week calendar, two phones overlapping its lower corners (coach chat on
 * an island-style phone, proposal approval on a punch-hole-style phone), and
 * a small browser-chromed intervals.icu shot as a supporting card at the end
 * of the science section. Screenshots render `cover` inside fixed-aspect,
 * overflow-hidden screen areas — nothing stretches, nothing shifts (fixed
 * widths + aspect ratios only). Order rationale: show the product before
 * arguing the method (see it → 80/20 → science → mechanics).
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
import {
  Image,
  ImageBackground,
  ImageSourcePropType,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { GlassCard } from '@/components/glass';
import { PressableScale } from '@/components/motion';
import { Button } from '@/components/ui';
import {
  device,
  fontSize,
  intensity,
  layout,
  lineHeight,
  radius,
  shadows,
  spacing,
  type Palette,
} from '@/theme';
import { useTheme } from '@/theme-context';

const BG_DARK = require('@/assets/bg-dark.jpg');
const BG_LIGHT = require('@/assets/bg-light.jpg');

/** Real product screenshots (round 12) — captured from the running app. */
const SHOTS = {
  desktop: require('@/assets/marketing/app-calendar-desktop.png'),
  coach: require('@/assets/marketing/app-coach-mobile.png'),
  proposal: require('@/assets/marketing/app-proposal-mobile.png'),
  icu: require('@/assets/marketing/intervals-icu.jpg'),
} as const;

/** Wide breakpoint: the showcase switches from stacked to overlapped stage. */
const SHOWCASE_WIDE = 900;
/** Flanking phone frame width on the wide stage. */
const PHONE_W = 190;
/** How far the phones climb onto the MacBook's lower corners. */
const PHONE_OVERLAP = 88;

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
  const { width } = useWindowDimensions();
  // Prerender-safe responsive switch: the static export can't know the
  // viewport (Dimensions reads 0 without DOM), so the prerendered HTML always
  // paints the stacked layout; after mount a wide viewport upgrades to the
  // overlapped stage. The section sits below the fold, so the upgrade is
  // invisible — and the first client render matches the prerender (no
  // hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const wide = mounted && width >= SHOWCASE_WIDE;

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

      {/* ── See it — real screens on CSS device frames (round 12) ────────────
          Wide: MacBook center stage, two phones overlapping its lower
          corners (paint above via zIndex), the MacBook caption sitting in
          the gap between the phones so every device is captioned underneath.
          Narrow: everything stacks vertically, no overlap. */}
      <View style={s.showcase}>
        <Text style={s.overline}>See it</Text>
        <Text style={s.sectionTitle}>Straight from the app.</Text>
        <Text style={s.sectionLead}>
          The calendar, the coach and the approval step — exactly as they ship.
        </Text>
        {wide ? (
          <View style={s.stageWide}>
            <View style={[s.macSlot, shadows(colors).bar]}>
              <MacBookFrame source={SHOTS.desktop} />
            </View>
            <View style={s.phonesRow}>
              <View style={s.phoneCol}>
                <PhoneFrame
                  source={SHOTS.coach}
                  variant="island"
                  width={PHONE_W}
                  style={shadows(colors).bar}
                />
                <Caption
                  label="A coach that knows your data"
                  line="Grounded in your actuals, HRV and plan — never generic tips."
                  labelStyle={s.captionLabel}
                  lineStyle={s.captionLine}
                />
              </View>
              <View style={s.macCaptionCol}>
                <Caption
                  label="Your week, honestly"
                  line="Planned against done, with load, zones and form in one place."
                  labelStyle={s.captionLabel}
                  lineStyle={s.captionLine}
                />
              </View>
              <View style={s.phoneCol}>
                <PhoneFrame
                  source={SHOTS.proposal}
                  variant="hole"
                  width={PHONE_W}
                  style={shadows(colors).bar}
                />
                <Caption
                  label="Nothing changes without you"
                  line="Every write arrives as a proposal — approve or dismiss, nothing else."
                  labelStyle={s.captionLabel}
                  lineStyle={s.captionLine}
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={s.stageNarrow}>
            <View style={[s.macSlot, shadows(colors).bar]}>
              <MacBookFrame source={SHOTS.desktop} />
            </View>
            <Caption
              label="Your week, honestly"
              line="Planned against done, with load, zones and form in one place."
              labelStyle={s.captionLabel}
              lineStyle={s.captionLine}
            />
            <PhoneFrame
              source={SHOTS.coach}
              variant="island"
              width={230}
              style={shadows(colors).bar}
            />
            <Caption
              label="A coach that knows your data"
              line="Grounded in your actuals, HRV and plan — never generic tips."
              labelStyle={s.captionLabel}
              lineStyle={s.captionLine}
            />
            <PhoneFrame
              source={SHOTS.proposal}
              variant="hole"
              width={230}
              style={shadows(colors).bar}
            />
            <Caption
              label="Nothing changes without you"
              line="Every write arrives as a proposal — approve or dismiss, nothing else."
              labelStyle={s.captionLabel}
              lineStyle={s.captionLine}
            />
          </View>
        )}
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
        {/* Supporting card: where the data comes from. Deliberately smaller
            and quieter than the showcase above — the product stays the star. */}
        <GlassCard style={wide ? s.icuCardWide : s.icuCardNarrow}>
          <BrowserFrame
            source={SHOTS.icu}
            style={wide ? s.icuFrameWide : s.icuFrameNarrow}
          />
          <View style={wide ? s.icuCopyWide : s.icuCopyNarrow}>
            <Caption
              label="Your intervals.icu, connected"
              line="The coach reads your intervals.icu fitness, fatigue, zones and calendar — nothing to migrate."
              labelStyle={s.captionLabel}
              lineStyle={wide ? s.icuLine : s.icuLineCenter}
              align={wide ? 'flex-start' : 'center'}
            />
          </View>
        </GlassCard>
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
        Educational guidance grounded in training science and your own data — not medical or
        professional advice. If something hurts, see a professional, not a plan tweak. Always do
        your own due diligence.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Device frames (round-12 showcase) — pure Views, chrome colors from
// theme.device (static: devices aren't themed surfaces). Screenshots render
// `cover` inside fixed-aspect, overflow-hidden screen areas so nothing
// stretches and nothing shifts. Shadows are passed in by the caller via the
// `style` prop (they need the live palette).
// ---------------------------------------------------------------------------

/** Small-caps label + one supporting line, centered under a device. */
function Caption({
  label,
  line,
  labelStyle,
  lineStyle,
  align = 'center',
}: {
  label: string;
  line: string;
  labelStyle: TextStyle;
  lineStyle: TextStyle;
  align?: 'flex-start' | 'center';
}) {
  return (
    <View style={[frameStyles.caption, { alignItems: align }]}>
      <Text style={labelStyle}>{label}</Text>
      <Text style={lineStyle}>{line}</Text>
    </View>
  );
}

/** MacBook: 16:10 screen in a dark bezel (rounded lid corners) over a wider
 *  bottom deck with a centered notch lip. */
function MacBookFrame({ source, style }: { source: ImageSourcePropType; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[frameStyles.macWrap, style]}>
      <View
        style={[
          frameStyles.macScreen,
          // bezelEdge rim (not bezel): the lid needs to separate from a dark
          // page background in the dark scheme; reads as a lit metal edge.
          { backgroundColor: device.screen, borderColor: device.bezelEdge },
        ]}
      >
        <Image
          source={source}
          style={frameStyles.screenImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
      <View
        style={[frameStyles.macDeck, { backgroundColor: device.deck, borderTopColor: device.bezelEdge, borderBottomColor: device.deckEdge }]}
      >
        <View style={[frameStyles.macLip, { backgroundColor: device.notch }]} />
      </View>
    </View>
  );
}

/** Phone: rounded slab, thin bezel, screen clipped to a tighter radius.
 *  `island` renders a Dynamic-Island-style pill; `hole` a centered
 *  punch-hole dot. Both sit over the screenshot like real device cutouts. */
function PhoneFrame({
  source,
  variant,
  width,
  style,
}: {
  source: ImageSourcePropType;
  variant: 'island' | 'hole';
  width: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        frameStyles.phoneBody,
        { width, backgroundColor: device.screen, borderColor: device.bezelEdge },
        style,
      ]}
    >
      <View style={frameStyles.phoneClip}>
        {/* Explicit width/height (not absoluteFill): RNW's object-fit cover
            needs real dimensions — with absoluteFill the img renders at
            natural size and cover never kicks in (MacBookFrame, which uses
            width/height 100%, scales correctly). */}
        <Image
          source={source}
          style={frameStyles.screenImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        {variant === 'island' ? (
          <View style={[frameStyles.phoneIsland, { backgroundColor: device.notch, borderColor: device.bezelEdge }]} />
        ) : (
          <View style={[frameStyles.phoneHole, { backgroundColor: device.notch, borderColor: device.bezelEdge }]} />
        )}
      </View>
    </View>
  );
}

/** Browser chrome (traffic dots + URL pill) over a fixed 16:10 screenshot —
 *  used for the muted intervals.icu support card. Chrome is fixed-light to
 *  match the light screenshot, hairline follows the live palette. */
function BrowserFrame({ source, style }: { source: ImageSourcePropType; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[frameStyles.browserWrap, { borderColor: colors.border }, style]}>
      <View style={[frameStyles.browserBar, { backgroundColor: device.browserBar }]}>
        {device.browserDots.map((dot) => (
          <View key={dot} style={[frameStyles.browserDot, { backgroundColor: dot }]} />
        ))}
        <View style={[frameStyles.browserUrl, { backgroundColor: device.browserUrl }]}>
          <Text style={[frameStyles.browserUrlText, { color: device.browserUrlText }]}>intervals.icu</Text>
        </View>
      </View>
      <View style={[frameStyles.browserScreen, { backgroundColor: device.screen }]}>
        <Image
          source={source}
          style={frameStyles.screenImg}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    </View>
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
    // ── See it showcase (round 12) ────────────────────────────────────────
    // Wider than the text sections: the MacBook is the page's set piece.
    showcase: { width: '100%', maxWidth: 880, alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
    // Slot that owns the MacBook's width + stacking position under the phones.
    macSlot: { alignSelf: 'center', width: '100%', maxWidth: 700, position: 'relative', zIndex: 0 },
    stageWide: { alignSelf: 'stretch', marginTop: spacing.lg },
    // Negative margin climbs the phones onto the MacBook's lower corners; the
    // row paints above (zIndex 1) and bottom-aligns the three captions.
    phonesRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: spacing.lg,
      marginTop: -PHONE_OVERLAP,
      position: 'relative',
      zIndex: 1,
    },
    phoneCol: { width: PHONE_W, alignItems: 'center', gap: spacing.sm },
    macCaptionCol: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: spacing.sm, paddingBottom: 2 },
    stageNarrow: { alignSelf: 'stretch', alignItems: 'center', gap: spacing.md, marginTop: spacing.lg },
    captionLabel: {
      color: p.text,
      fontSize: fontSize.tiny,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
    },
    captionLine: { color: p.muted, fontSize: fontSize.small, lineHeight: 18, textAlign: 'center' },
    // ICU support card — row beside the copy when wide, stacked when narrow.
    icuCardWide: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
    icuCardNarrow: { width: '100%', alignItems: 'center', gap: spacing.md },
    icuFrameWide: { width: 300, flexShrink: 0 },
    icuFrameNarrow: { width: '100%', maxWidth: 320 },
    icuCopyWide: { flex: 1 },
    icuCopyNarrow: { width: '100%', alignItems: 'center' },
    icuLine: { color: p.muted, fontSize: fontSize.small, lineHeight: 19, textAlign: 'left' },
    icuLineCenter: { color: p.muted, fontSize: fontSize.small, lineHeight: 19, textAlign: 'center' },
  });

/**
 * Device-frame chrome — static (theme.device colors, no palette), so this
 * sheet is module-level. Palette-carrying styles (shadows, hairlines) are
 * passed in by the callers above.
 */
const frameStyles = StyleSheet.create({
  caption: { gap: 2 },
  // MacBook: screen area is 16:10 like the 1440×900 capture, so `cover` fits
  // 1:1 modulo the bezel inset (a hair of crop, absorbed by the frame). The
  // deck runs wider than the lid and carries the centered notch lip.
  macWrap: { width: '100%', alignItems: 'center' },
  macScreen: {
    width: '100%',
    aspectRatio: 16 / 10,
    borderWidth: 10,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    overflow: 'hidden',
  },
  screenImg: { width: '100%', height: '100%' },
  macDeck: {
    width: '112%',
    height: 15,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: 'center',
  },
  macLip: {
    position: 'absolute',
    top: 0,
    width: '13%',
    height: 6,
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },
  // Phone: body ratio matches the 393×852 captures; border-box sizing keeps
  // the screen within a px or two of the source ratio — `cover` absorbs the
  // rest. The tighter clip radius fakes the screen inset inside the bezel
  // (outer 30 − border 8 = concentric 22).
  phoneBody: { aspectRatio: 393 / 852, borderWidth: 8, borderRadius: 30, overflow: 'hidden' },
  phoneClip: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  phoneIsland: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    width: '24%',
    height: 13,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  phoneHole: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  // Browser chrome: fixed-light to sit on the light intervals.icu shot; the
  // wrap clips the bar + screenshot to one rounded card.
  browserWrap: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  browserBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
  },
  browserDot: { width: 8, height: 8, borderRadius: radius.pill },
  browserUrl: {
    flex: 1,
    marginLeft: spacing.sm,
    borderRadius: radius.sm,
    paddingVertical: 3,
    paddingHorizontal: spacing.sm + 2,
  },
  browserUrlText: { fontSize: fontSize.tiny, fontWeight: '600' },
  browserScreen: { aspectRatio: 1440 / 900 },
});
