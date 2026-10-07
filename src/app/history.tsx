/** Chapters opened in the reader, newest first; tapping one opens it again. */
import { router, Stack } from 'expo-router';
import { FlatList, StyleSheet } from 'react-native';

import { getBooks, useAsync } from '@/bible/queries';
import { clearHistory } from '@/bible/reading';
import { bookChapterTitle } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { confirm } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { Empty, IconButton, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

export default function HistoryScreen() {
  const theme = useTheme();
  const t = useT();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [history] = useSetting(settings.history);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const at = history.index < 0 ? history.items.length - 1 : history.index;
  const items = history.items.map((ari, index) => ({ ari, index })).reverse();

  const open = (index: number, ari: number) => {
    settings.history.set({ items: history.items, index });
    settings.position.set(ari);
    router.back();
  };
  const clear = () =>
    confirm({ title: t('Clear the reading history?'), confirmText: t('Clear'), destructive: true }).then((ok) => ok && clearHistory());

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: items.length
            ? () => <IconButton icon={Icons.trash} label={t('Clear history')} color={theme.danger} onPress={clear} />
            : undefined,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(it) => String(it.index)}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        ListEmptyComponent={<Empty title={t('No history yet')} message={t('Chapters you open in the reader are listed here.')} />}
        renderItem={({ item }) => (
          <Row
            left={<Icon name={Icons.book} size={18} color={item.index === at ? theme.tint : theme.textSecondary} />}
            title={bookChapterTitle(books, item.ari) || '…'}
            detail={item.index === at ? t('Current') : undefined}
            onPress={() => open(item.index, item.ari)}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.five },
});
