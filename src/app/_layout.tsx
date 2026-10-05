import { DatabaseProvider } from '@nozbe/watermelondb/react';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Appearance, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { setupBibles } from '@/bible/versions';
import { DialogHost } from '@/components/dialogs';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database } from '@/db';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { settings, useSetting } from '@/settings';

SplashScreen.preventAutoHideAsync();

/**
 * Light / dark choice from Settings; 'system' follows the phone. The web has no
 * Appearance.setColorScheme; its useColorScheme reads the setting instead.
 */
function applyTheme(theme: ReturnType<typeof settings.theme.get>) {
  if (Platform.OS !== 'web') Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
}
applyTheme(settings.theme.get()); // before the first render, so there is no flash

const sheet = {
  presentation: 'formSheet' as const,
  sheetGrabberVisible: true,
  sheetAllowedDetents: [0.6, 1],
  // web (EXPO_UNSTABLE_WEB_MODAL, see metro.config.js): a dialog on wide screens
  webModalStyle: { width: 560, minWidth: 360, height: '80%', minHeight: 420 },
};

export default function RootLayout() {
  const [theme] = useSetting(settings.theme);
  useEffect(() => applyTheme(theme), [theme]);
  const colorScheme = useColorScheme();
  const [state, setState] = useState<'loading' | 'ready' | Error>('loading');

  const load = () =>
    setupBibles().then(
      () => setState('ready'),
      (e: Error) => setState(e),
    );
  const retry = () => {
    setState('loading');
    load();
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (state !== 'loading') SplashScreen.hideAsync();
  }, [state]);

  return (
    <GestureHandlerRootView style={styles.fill}>
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <DatabaseProvider database={database}>
        {state === 'ready' ? (
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="strongs/[number]" options={{ title: "Strong's" }} />
            <Stack.Screen name="study" options={{ title: 'Study' }} />
            <Stack.Screen name="passage" options={{ ...sheet, sheetAllowedDetents: [1], title: 'Go to' }} />
            <Stack.Screen name="version-picker" options={{ ...sheet, title: 'Version' }} />
            <Stack.Screen name="note" options={{ ...sheet, title: 'Note' }} />
            <Stack.Screen name="tag-verses" options={{ ...sheet, title: 'Tags' }} />
            <Stack.Screen name="tag-edit" options={{ ...sheet, title: 'Tag' }} />
            <Stack.Screen name="topic-edit" options={{ ...sheet, title: 'Topic' }} />
            <Stack.Screen name="topic-picker" options={{ ...sheet, title: 'Add to topic' }} />
            <Stack.Screen name="strongs-search" options={{ ...sheet, sheetAllowedDetents: [1], title: "Add Strong's words" }} />
          </Stack>
        ) : state === 'loading' ? null : (
          <View style={styles.error}>
            <ThemedText type="smallBold">Could not open the Bible files</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {state.message}
            </ThemedText>
            <Button title="Try again" onPress={retry} />
          </View>
        )}
        <DialogHost />
      </DatabaseProvider>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  error: { flex: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
});
