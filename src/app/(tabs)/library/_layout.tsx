import { Stack } from 'expo-router';

import { useT } from '@/i18n';

export default function LibraryLayout() {
  const t = useT();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('Library'), headerLargeTitle: true }} />
    </Stack>
  );
}
