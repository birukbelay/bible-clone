/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: '#9B1C1C',
    /** light background of the selected book, current chapter row, ... */
    tintSoft: '#FBECEC',
    /** second version's verse numbers in split view */
    splitTint: '#2E7D32',
    border: '#D9D9E0',
    redLetter: '#B42318',
    danger: '#D92D20',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#E5484D',
    tintSoft: '#3B1F21',
    splitTint: '#5BB98B',
    border: '#3A3D42',
    redLetter: '#F97066',
    danger: '#F97066',
  },
  /** warm paper; light status bar and controls */
  sepia: {
    text: '#3B2F22',
    background: '#F4ECD8',
    backgroundElement: '#EADFC6',
    backgroundSelected: '#DFD1B3',
    textSecondary: '#6E5E4A',
    tint: '#8B3A1A',
    tintSoft: '#EDD9C0',
    splitTint: '#4A6B2A',
    border: '#D6C7A8',
    redLetter: '#A5321B',
    danger: '#B42318',
  },
  /** pure black for OLED screens, dimmer text; dark status bar and controls */
  black: {
    text: '#D7D7D7',
    background: '#000000',
    backgroundElement: '#111111',
    backgroundSelected: '#1C1C1C',
    textSecondary: '#8E8E8E',
    tint: '#D9534F',
    tintSoft: '#2A1414',
    splitTint: '#4FA77A',
    border: '#262626',
    redLetter: '#E0675F',
    danger: '#E0675F',
  },
} as const;

export type Palette = { [K in keyof typeof Colors.light]: string };

/** Verse highlight palette; the index is what gets stored in the highlights table. */
export const HighlightColors = [
  'rgba(250, 204, 21, 0.35)',
  'rgba(74, 222, 128, 0.32)',
  'rgba(96, 165, 250, 0.32)',
  'rgba(244, 114, 182, 0.32)',
  'rgba(251, 146, 60, 0.35)',
] as const;

/** Default colors offered for new tags. */
export const TagColors = ['#208AEF', '#12B76A', '#F79009', '#D92D20', '#7A5AF8', '#667085'] as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
