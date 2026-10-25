/**
 * intervals design tokens — the single source of color/space/type in the app.
 *
 * System: iOS-26 "liquid glass" on a viet-study chassis (see
 * docs/design/DESIGN-LANGUAGE.md). Dark-first per SPEC ("calm data, confident
 * chrome"); a light palette tuned from viet-study's own values ships alongside.
 *
 * RULES
 * - Every component consumes tokens; ZERO hex/rgba literals outside this file.
 * - Race color is reserved: it may only ever mark RACE events/badges.
 * - Zone colors run cool→hot (Z1 recovery → Z7 max) and are reserved for
 *   intensity data (zone bars, 80/20 split) — never decoration.
 * - Static style sheets that need colors are built by `makeStyles(palette)`
 *   factories so a theme switch re-styles the app live (see theme-context.tsx).
 */

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

export interface Palette {
  /** App background (behind everything, including scroll areas). */
  bg: string;
  /** Solid raised surface (cards on top of bg). */
  card: string;
  /** Translucent surface for glass bars/sheets (blur goes under it). */
  glass: string;
  /** Heavier translucent surface for sheets/modals over content. */
  glassStrong: string;
  /** Hairline on solid surfaces. */
  border: string;
  /** 1px light hairline on glass surfaces (white@10% in dark). */
  borderGlass: string;
  /** Emphasized border (focus / today outline). */
  borderStrong: string;
  text: string;
  muted: string;
  /** Muted text that must stay AA-legible on busy/imagery surfaces (hero mesh)
   *  and at tiny sizes — darker than `muted` in light, brighter in dark. */
  mutedStrong: string;
  /** Inverted text on accent fills. */
  onAccent: string;
  /** Accent as a fill (buttons, active pills, user bubbles). */
  accent: string;
  /** Accent tinted wash (selected rows, pending bars). */
  accentSoft: string;
  /** Accent as text on bg — brightened in dark for contrast. */
  accentText: string;
  success: string;
  danger: string;
  /** RACE ONLY. Same hue across themes; light theme darkens for contrast. */
  race: string;
  /** Translucent scrim behind modals. */
  overlay: string;
  /** Zone scale, Z1 (cool/recovery) → Z7 (hot/max). Index 0 = Z1. */
  zones: [string, string, string, string, string, string, string];
  /** Base shadow color for soft depth (used by shadows.*). */
  shadowColor: string;
}

/** Dark — deep navy-black, indigo accent, white hairlines. */
export const dark: Palette = {
  bg: '#0b0e15',
  card: '#151926',
  glass: 'rgba(21, 26, 40, 0.72)',
  glassStrong: 'rgba(24, 29, 46, 0.88)',
  border: 'rgba(255, 255, 255, 0.07)',
  borderGlass: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  text: '#f3f5fa',
  muted: '#98a1b8',
  mutedStrong: '#ccd4e6',
  onAccent: '#ffffff',
  // deepened from #5b74f0 so white-on-accent passes WCAG AA (5.05:1) in dark mode
  accent: '#4a63e0',
  accentSoft: 'rgba(91, 116, 240, 0.16)',
  accentText: '#96a9ff',
  success: '#41b26e',
  danger: '#e5584f',
  race: '#e0a458',
  overlay: 'rgba(3, 5, 10, 0.60)',
  zones: ['#6d9bd6', '#54b8c9', '#54c78c', '#cfc45c', '#e5a458', '#e5705c', '#df5c78'],
  shadowColor: '#000000',
};

/** Light — tuned from viet-study's own values (#f2f6fe bg, #10193b ink, indigo). */
export const light: Palette = {
  bg: '#f2f6fe',
  card: '#ffffff',
  glass: 'rgba(255, 255, 255, 0.78)',
  glassStrong: 'rgba(255, 255, 255, 0.92)',
  border: 'rgba(16, 25, 59, 0.08)',
  borderGlass: 'rgba(228, 234, 246, 0.90)',
  borderStrong: 'rgba(67, 89, 230, 0.45)',
  text: '#10193b',
  muted: '#5f6c92',
  mutedStrong: '#47516e',
  onAccent: '#ffffff',
  accent: '#4359e6',
  accentSoft: 'rgba(67, 89, 230, 0.10)',
  accentText: '#3f50d6',
  success: '#2da44e',
  danger: '#d9483f',
  race: '#b97c2c',
  overlay: 'rgba(16, 25, 59, 0.35)',
  zones: ['#5b8fd0', '#3fa8bb', '#3fb87e', '#b8ad42', '#d18f42', '#d15f44', '#cc4f66'],
  shadowColor: '#3f59b4',
};

export const palettes = { light, dark } as const;
export type Scheme = keyof typeof palettes;
export type ThemePreference = 'system' | Scheme;

// ---------------------------------------------------------------------------
// Scales (theme-independent)
// ---------------------------------------------------------------------------

/** 4-pt grid. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Page-level rhythm (round 9): the vertical story of a screen, named once so
 * spacing stops being arbitrary. Chrome → content at navToContent; major
 * sections separate at sectionGap; sibling surfaces inside a section at
 * cardGap. List rows are NOT separate cards — they live inside ONE containing
 * card with hairline separators (the anti-"floating cards" rule), padded by
 * rowPadX/rowPadY, inside a card padded by cardPad.
 */
export const pageSpacing = {
  /** Fixed chrome (nav bar) → first content block. */
  navToContent: 12,
  /** Between major sections (stats card ↔ calendar list). */
  sectionGap: 20,
  /** Between sibling surfaces in one section (hint/empty rows, month panel). */
  cardGap: 8,
  /** Internal padding of a containing card. */
  cardPad: 16,
  /** Horizontal padding of rows inside a group card. */
  rowPadX: 14,
  /** Vertical padding of rows inside a group card. */
  rowPadY: 12,
} as const;

export const fontSize = {
  tiny: 11,
  small: 13,
  body: 15,
  h: 20,
  title: 26,
  display: 36,
} as const;

export const lineHeight = {
  tiny: 14,
  small: 18,
  body: 22,
  h: 26,
  title: 32,
  display: 42,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export const layout = {
  /** Max content width on wide web viewports. */
  maxW: 860,
  /** Floating tab bar metrics (viet-study chassis). */
  tabBarHeight: 62,
  tabBarInset: 12,
  tabBarBottom: 10,
  /** Minimum interactive target (iOS HIG). */
  minTouch: 44,
} as const;

/** Springy motion constants (all durations ms; springs use tension/friction). */
export const motion = {
  pressScale: 0.97,
  pressSpring: { friction: 20, tension: 400, useNativeDriver: true },
  releaseSpring: { friction: 18, tension: 300, useNativeDriver: true },
  /** Week/month switch cross-slide. */
  pageSlide: 180,
  /** Sheet slide-up. */
  sheetSpring: { friction: 24, tension: 320, useNativeDriver: true },
} as const;

/** Soft depth shadows (viet-style diffuse, never heavy). Per-scheme. */
export const shadows = (p: Palette) => ({
  card: {
    shadowColor: p.shadowColor,
    shadowOpacity: 0.10,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  bar: {
    shadowColor: p.shadowColor,
    shadowOpacity: 0.16,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
} as const);

/**
 * Device-frame chrome for the marketing "See it" showcase (web-only splash).
 * Devices are physical objects, not themed surfaces — the same anodized
 * finish reads correctly in both schemes, so these are static (not per-
 * palette) tokens. `browser*` chrome is light on purpose: it frames the light
 * intervals.icu screenshot.
 */
export const device = {
  /** Dark glass bezel (MacBook lid rim, phone rim). */
  bezel: '#10131b',
  /** Hairline highlight on the bezel edge / hinge / island ring. */
  bezelEdge: '#2b3245',
  /** MacBook bottom deck. */
  deck: '#161b26',
  /** Deck's lower shadow line. */
  deckEdge: '#070a10',
  /** Letterbox behind screenshots inside a frame. */
  screen: '#05070c',
  /** Cutouts: Dynamic-Island pill, punch-hole, deck notch lip. */
  notch: '#03050a',
  /** macOS-style traffic lights (decorative, fixed hues). */
  browserDots: ['#ff5f57', '#febc2e', '#28c840'] as [string, string, string],
  /** Light browser chrome bar around the intervals.icu shot. */
  browserBar: '#e8ecf4',
  /** URL pill inside the chrome bar. */
  browserUrl: '#ffffff',
  /** URL text (light.muted — fixed, the chrome is fixed-light). */
  browserUrlText: '#5f6c92',
} as const;

// ---------------------------------------------------------------------------
// Semantic helpers
// ---------------------------------------------------------------------------

/** Zone tint by 1-based zone number (Z1..Z7); unknown ids map to muted gray. */
export function zoneColor(p: Palette, zoneId: string): string {
  const m = /^Z([1-7])$/i.exec(zoneId.trim());
  if (!m) return p.muted;
  return p.zones[Number(m[1]) - 1]!;
}

/** Intensity poles used by the 80/20 split: easy (cool/green) vs fast (hot). */
export const intensity = (p: Palette) => ({ easy: p.zones[2], fast: p.zones[5] }) as const;

/**
 * The active palette for a preference + OS scheme. Exposed for tests and for
 * non-React consumers; components should use useTheme() instead.
 */
export function resolvePalette(preference: ThemePreference, systemScheme: Scheme | null | undefined): Palette {
  const scheme: Scheme =
    preference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : preference;
  return palettes[scheme];
}
