import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset, Spacing } from '@/constants/theme';

/**
 * Space to keep free at the bottom of a tab screen for floating content. On iOS the tab bar
 * floats over the screen; on Android the screen already ends above it.
 */
export function useTabBottomInset() {
  const insets = useSafeAreaInsets();
  return Platform.OS === 'ios' ? insets.bottom + BottomTabInset + Spacing.two : Spacing.three;
}
