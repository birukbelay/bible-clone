import { Stack } from 'expo-router';

import { useT } from '@/i18n';

export default function SearchLayout() {
  const t = useT();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('Search'), headerLargeTitle: true }} />
    </Stack>
  );
}
