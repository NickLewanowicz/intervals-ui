/**
 * Widget-only design tokens — a flat mirror of the app's DARK palette
 * (src/theme.ts `dark`), kept separate so home-screen widget rendering never
 * imports the app theme tree (theme-context, motion, RN StyleSheet helpers —
 * none of which exist in the widget headless render context).
 *
 * Widgets render through react-native-android-widget primitives, whose
 * colors must be hex or rgba() strings — exactly what the palette stores.
 * Same rule as the app: ZERO color literals outside this file.
 *
 * RACE color is reserved for race rows; success/danger only ever mark
 * direction (done / deltas) — never decoration.
 */

export const widgetTheme = {
  /** Deep navy-black surface — the widget card itself. */
  card: '#151926',
  /** Page background tone (unused as widget bg; kept for parity). */
  bg: '#0b0e15',
  /** Hairline on the card (dark.borderGlass). */
  borderGlass: 'rgba(255, 255, 255, 0.10)',
  /** Emphasized border (today outline / delta chip ring, dark.borderStrong). */
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  text: '#f3f5fa',
  muted: '#98a1b8',
  mutedStrong: '#ccd4e6',
  onAccent: '#ffffff',
  /** Deepened indigo — white-on-accent passes WCAG AA (5.05:1). */
  accent: '#4a63e0',
  accentSoft: 'rgba(91, 116, 240, 0.16)',
  /** Accent as text on the card — brightened for contrast on dark. */
  accentText: '#96a9ff',
  success: '#41b26e',
  /** Done-state date-chip fill (success at chip-friendly alpha). */
  successSoft: 'rgba(65, 178, 110, 0.18)',
  danger: '#e5584f',
  /** RACE ONLY. */
  race: '#e0a458',
} as const;

export type WidgetColor = keyof typeof widgetTheme;
