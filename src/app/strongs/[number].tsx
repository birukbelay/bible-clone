/** One Strong's entry: definition, KJV usage, and every verse using the word. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { parseStrongsDescription } from '@/bible/markup';
import { useAsync } from '@/bible/queries';
import { getStrong, versesForStrongs } from '@/bible/strongs';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Loading } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';

export default function StrongsScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const t = useT();
  const { data: entry, loading } = useAsync(() => getStrong(number), [number]);
  const { data: verses } = useAsync(async () => {
    const rows = await versesForStrongs([number]);
    return rows.map<VerseListItem>((v) => ({ key: String(v.ari), ari: v.ari, ariEnd: v.ari }));
  }, [number]);

  if (loading && !entry) return <Loading />;
  if (!entry) return <Empty title={t('{number} is not in the dictionary', { number })} />;

  const { parts, translation } = parseStrongsDescription(entry.description);
  const emphasize = new Set([number]);

  const header = (
    <VerseListHeader>
      <View style={styles.title}>
        <ThemedText type="subtitle">{entry.lemma}</ThemedText>
        <ThemedText themeColor="textSecondary">
          {[entry.xlit, entry.pronounce && `(${entry.pronounce})`].filter(Boolean).join(' ')}
        </ThemedText>
      </View>
      {parts.length > 0 && (
        <ThemedText>
          {parts.map((p, i) =>
            'strong' in p ? (
              <ThemedText
                key={i}
                themeColor="tint"
                style={styles.ref}
                onPress={() => router.push({ pathname: '/strongs/[number]', params: { number: p.strong } })}>
                {p.strong}
              </ThemedText>
            ) : (
              p.text
            ),
          )}
        </ThemedText>
      )}
      {translation ? (
        <ThemedText type="small" themeColor="textSecondary">
          {translation}
        </ThemedText>
      ) : null}
      {entry.usage ? (
        <View style={styles.usage}>
          <ThemedText type="smallBold">KJV</ThemedText>
          <ThemedText type="small">{entry.usage}</ThemedText>
        </View>
      ) : null}
      <Button
        kind="plain"
        icon={Icons.topic}
        title={t('Add to a topic')}
        onPress={() => router.push({ pathname: '/topic-picker', params: { strongs: number } })}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {t('{count} times in {verses} verses', { count: entry.occurrences, verses: entry.verses })}
      </ThemedText>
    </VerseListHeader>
  );

  return (
    <>
      <Stack.Screen options={{ title: number }} />
      <VerseList items={verses} header={header} emphasize={emphasize} bottomInset={Spacing.five} />
    </>
  );
}

const styles = StyleSheet.create({
  title: { gap: Spacing.one },
  usage: { gap: Spacing.half },
  ref: { fontWeight: '700' },
});
