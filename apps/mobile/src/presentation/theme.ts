import type { TextStyle } from 'react-native';

// ── Light Colors ─────────────────────────────────────────────────────────────
export const lightColors = {
  // Primary — cyan palette anchored on #b3f1fc
  primary: '#0891b2',
  primaryHover: '#0e7490',
  primaryLight: '#b3f1fc',
  primarySoft: '#e0f7fc',

  // Surfaces & Backgrounds
  bg: '#f0fbff',
  bgSubtle: '#e8f4f8',
  surface: '#ffffff',

  // Text
  text: '#0f172a',
  textDark: '#1e293b',
  textMedium: '#334155',
  textLight: '#475569',
  textSecondary: '#64748b',
  textDisabled: '#94a3b8',

  // Borders
  border: '#e2e8f0',
  borderStrong: '#cbd5e1',

  // Semantic — Success
  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  successText: '#166534',

  // Semantic — Warning
  warning: '#d97706',
  warningBg: '#fef3c7',
  warningText: '#92400e',
  warningBorder: '#fbbf24',
  warningLightBg: '#fffbeb',
  warningAccent: '#f59e0b',

  // Semantic — Danger / Error
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#991b1b',

  // Semantic — Info
  info: '#0891b2',
  infoBg: '#e0f7fc',
  infoText: '#0e7490',

  // Overlays
  overlay: 'rgba(0,0,0,0.5)',

  // Constant
  white: '#ffffff',
  transparent: 'transparent',
} as const;

// ── Dark Colors (base: #011627) ──────────────────────────────────────────────
export const darkColors: Colors = {
  // Primary — brighter cyan for dark backgrounds
  primary: '#22d3ee',
  primaryHover: '#06b6d4',
  primaryLight: '#155e75',
  primarySoft: '#0c3547',

  // Surfaces & Backgrounds
  bg: '#011627',
  bgSubtle: '#012038',
  surface: '#01253f',

  // Text — light for readability on dark
  text: '#e2e8f0',
  textDark: '#f1f5f9',
  textMedium: '#cbd5e1',
  textLight: '#94a3b8',
  textSecondary: '#7c93b0',
  textDisabled: '#4a6380',

  // Borders
  border: '#1e3a5f',
  borderStrong: '#2d5085',

  // Semantic — Success
  success: '#4ade80',
  successBg: '#052e16',
  successBorder: '#166534',
  successText: '#86efac',

  // Semantic — Warning
  warning: '#fbbf24',
  warningBg: '#451a03',
  warningText: '#fde68a',
  warningBorder: '#92400e',
  warningLightBg: '#2d1600',
  warningAccent: '#f59e0b',

  // Semantic — Danger / Error
  danger: '#f87171',
  dangerBg: '#450a0a',
  dangerBorder: '#991b1b',
  dangerText: '#fca5a5',

  // Semantic — Info
  info: '#22d3ee',
  infoBg: '#0c3547',
  infoText: '#67e8f9',

  // Overlays
  overlay: 'rgba(0,0,0,0.7)',

  // Constant
  white: '#ffffff',
  transparent: 'transparent',
};

export type Colors = { [K in keyof typeof lightColors]: string };

/** @deprecated Use `useTheme()` hook instead. Kept for backward compatibility during migration. */
export const colors = lightColors;

// ── Spacing (4px grid) ─────────────────────────────────────────────────────
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
} as const;

// ── Typography ─────────────────────────────────────────────────────────────
export const fontSizes = {
  xs: 11,
  sm: 12,
  base: 14,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
} as const;

export const fontWeights = {
  normal: '400' as TextStyle['fontWeight'],
  medium: '500' as TextStyle['fontWeight'],
  semibold: '600' as TextStyle['fontWeight'],
  bold: '700' as TextStyle['fontWeight'],
};

export const typography = {
  h1: { fontSize: fontSizes['3xl'], fontWeight: fontWeights.bold, lineHeight: 32 },
  h2: { fontSize: fontSizes.xl, fontWeight: fontWeights.bold, lineHeight: 24 },
  h3: { fontSize: fontSizes.lg, fontWeight: fontWeights.semibold, lineHeight: 22 },
  body: { fontSize: fontSizes.base, fontWeight: fontWeights.normal, lineHeight: 20 },
  bodyMedium: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, lineHeight: 20 },
  caption: { fontSize: fontSizes.sm, fontWeight: fontWeights.normal, lineHeight: 16 },
  label: { fontSize: fontSizes.base, fontWeight: fontWeights.medium, lineHeight: 20 },
  small: { fontSize: fontSizes.xs, fontWeight: fontWeights.normal, lineHeight: 14 },
} as const;

// ── Border Radius ──────────────────────────────────────────────────────────
export const radius = {
  sm: 4,
  base: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
} as const;

// ── Shadows ────────────────────────────────────────────────────────────────
export const shadows = {
  none: {
    shadowColor: lightColors.transparent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
