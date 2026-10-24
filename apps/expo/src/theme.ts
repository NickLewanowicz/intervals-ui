/**
 * Grayscale-first theme tokens (dark). Look-and-feel polish happens in a
 * separate visual pass — screens must consume ONLY these constants.
 */
export const colors = {
  bg: '#111111',
  card: '#1c1c1e',
  border: '#2c2c2e',
  text: '#f2f2f2',
  muted: '#9a9a9e',
  accent: '#4a90d9',
  danger: '#d9534f',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fontSize = {
  tiny: 11,
  small: 13,
  body: 15,
  h: 18,
  title: 24,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const layout = {
  /** Max content width on wide web viewports. */
  maxW: 860,
} as const;
