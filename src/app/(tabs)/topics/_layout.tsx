import { Stack } from 'expo-router';

export default function TopicsLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: 'Topics', headerLargeTitle: true }} />
    </Stack>
  );
}
