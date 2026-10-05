import { useEffect, useSyncExternalStore } from 'react';
import { useColorScheme as useSystemColorScheme } from 'react-native';

import { settings, useSetting } from '@/settings';

const noSubscription = () => () => {};

/**
 * The theme chosen in Settings, else the browser's. (react-native-web cannot override the
 * system scheme like Appearance.setColorScheme does on the phone.) Static rendering has no
 * settings or media queries, so the page starts light and switches after hydration.
 */
export function useColorScheme() {
  // false while hydrating the static page, true afterwards
  const hasHydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  const [theme] = useSetting(settings.theme);
  const system = useSystemColorScheme();

  const scheme = theme === 'system' ? system : theme;

  // native form controls and scrollbars follow the page
  useEffect(() => {
    if (hasHydrated) document.documentElement.style.colorScheme = scheme === 'dark' ? 'dark' : 'light';
  }, [hasHydrated, scheme]);

  return hasHydrated ? scheme : 'light';
}
