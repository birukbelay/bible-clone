/** Study one verse: the Strong's words it uses and its cross references. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { getBooks, getRange, useAsync } from '@/bible/queries';
import { formatRef } from '@/bible/reference';
import { crossReferences, strongsOfVerse } from '@/bible/strongs';
import { useCurrentVersion } from '@/bible/versions';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Empty, IconButton, Row, Segmented } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { VerseText } from '@/components/verse-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

type Tab = 'words' | 'xrefs';

export default function StudyScreen() {
  const { ari: param } = useLocalSearchParams<{ ari: string }>();
  const ari = Number(param);
  const theme = useTheme();
  const t = useT();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [fontSize] = useSetting(settings.fontSize);
  const [redLetters] = useSetting(settings.redLetters);
  const [tab, setTab] = useState<Tab>('words');
  const [selected, setSelected] = useState<string | null>(null);

  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { data: verse } = useAsync(async () => (await getRange(versionId, ari))[0] ?? null, [versionId, ari]);
  const { data: words } = useAsync(() => strongsOfVerse(ari), [ari]);
  const { data: xrefs } = useAsync(async () => {
    const rows = await crossReferences(ari, 80);
    return rows.map<VerseListItem>((r, i) => ({ key: `${i}:${r.ari}`, ari: r.ari, ariEnd: r.ariEnd }));
  }, [ari]);

  const header = (
    <VerseListHeader>
      {verse ? (
        <VerseText
          text={verse.text}
          fontSize={fontSize}
          redLetters={redLetters}
          showStrongs={version?.strongs}
          emphasize={selected ? new Set([selected]) : undefined}
          onStrongPress={setSelected}
        />
      ) : null}
      <Segmented<Tab>
        options={[
          { value: 'words', label: `${t('Original words')}${words ? ` (${words.length})` : ''}` },
          { value: 'xrefs', label: `${t('Cross references')}${xrefs ? ` (${xrefs.length})` : ''}` },
        ]}
        value={tab}
        onChange={setTab}
      />
    </VerseListHeader>
  );

  return (
    <>
      <Stack.Screen options={{ title: formatRef(books, ari) }} />
      {tab === 'xrefs' ? (
        <VerseList
          items={xrefs}
          header={header}
          bottomInset={Spacing.five}
          empty={<Empty title={t('No cross references for this verse')} />}
        />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(w) => w.number}
          contentInsetAdjustmentBehavior="automatic"
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={{ paddingBottom: Spacing.five }}
          ListHeaderComponent={header}
          ListEmptyComponent={words ? <Empty title={t("No Strong's words indexed for this verse")} /> : null}
          renderItem={({ item }) => (
            <Row
              title={
                <ThemedText>
                  <ThemedText type="smallBold" themeColor="tint">
                    {item.number}
                  </ThemedText>
                  {`  ${item.lemma ?? ''}  `}
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.xlit ?? ''}
                  </ThemedText>
                </ThemedText>
              }
              subtitle={item.usage ?? undefined}
              onPress={() => router.push({ pathname: '/strongs/[number]', params: { number: item.number } })}
              onLongPress={() => setSelected(item.number === selected ? null : item.number)}
              right={
                <View style={styles.actions}>
                  {item.cnt > 1 && (
                    <ThemedText type="small" themeColor="textSecondary">
                      ×{item.cnt}
                    </ThemedText>
                  )}
                  <IconButton
                    icon={Icons.topic}
                    label={t('Add {number} to a topic', { number: item.number })}
                    color={theme.tint}
                    onPress={() => router.push({ pathname: '/topic-picker', params: { strongs: item.number } })}
                  />
                </View>
              }
            />
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
