/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settings, useSetting } from '@/settings';

/** Colors of the theme chosen in Settings; sepia and black are a light and a dark scheme with their own palette. */
export function useTheme() {
  const scheme = useColorScheme();
  const [choice] = useSetting(settings.theme);
  if (choice === 'sepia' || choice === 'black') return Colors[choice];
  return Colors[scheme === 'dark' ? 'dark' : 'light'];
}
