import { Stack } from 'expo-router';

import { useT } from '@/i18n';

export default function SettingsLayout() {
  const t = useT();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('Settings'), headerLargeTitle: true }} />
    </Stack>
  );
}
