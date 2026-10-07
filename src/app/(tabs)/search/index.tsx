/** Search: full-text search of the current version, or the Strong's dictionary. */
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';

import { searchText, useAsync, type SearchScope } from '@/bible/queries';
import { searchStrongs } from '@/bible/strongs';
import { useCurrentVersion } from '@/bible/versions';
import { ThemedText } from '@/components/themed-text';
import { Empty, Field, Row, Segmented } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

type Mode = 'text' | 'strongs';
type Scope = 'all' | 'ot' | 'nt';

const LIMIT = 500;
/** browsers get a plain field: their header search bar hides behind a button */
const NATIVE_SEARCH_BAR = Platform.OS !== 'web';

export default function SearchScreen() {
  const theme = useTheme();
  const t = useT();
  const bottomInset = useTabBottomInset();
  const version = useCurrentVersion();
  const [mode, setMode] = useState<Mode>('text');
  const [scope, setScope] = useState<Scope>('all');
  const [input, setInput] = useState('');
  const query = useDebounced(input.trim(), 300);
  const versionId = version?.id ?? '';

  const { data: verses, loading: textLoading } = useAsync(async () => {
    if (mode !== 'text' || !query || !versionId) return undefined;
    const rows = await searchText(versionId, query, scope satisfies SearchScope, LIMIT);
    return rows.map<VerseListItem>((v) => ({ key: String(v.ari), ari: v.ari, ariEnd: v.ari_end }));
  }, [mode, query, scope, versionId]);

  const { data: entries } = useAsync(
    async () => (mode === 'strongs' && query ? searchStrongs(query, 80) : undefined),
    [mode, query],
  );

  const placeholder = mode === 'text' ? t('Search {version}', { version: version?.shortName ?? '' }) : t('Word, G4678, H2451…');
  const controls = (
    <View style={styles.controls}>
      {!NATIVE_SEARCH_BAR && (
        <Field
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="search"
          aria-label={t('Search')}
        />
      )}
      <Segmented<Mode>
        options={[
          { value: 'text', label: t('Bible text') },
          { value: 'strongs', label: t("Strong's") },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'text' && (
        <Segmented<Scope>
          options={[
            { value: 'all', label: t('Whole Bible') },
            { value: 'ot', label: t('Old Testament') },
            { value: 'nt', label: t('New Testament') },
          ]}
          value={scope}
          onChange={setScope}
        />
      )}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: NATIVE_SEARCH_BAR
            ? {
                placeholder,
                autoCapitalize: 'none',
                hideWhenScrolling: false,
                onChangeText: (e) => setInput(e.nativeEvent.text),
              }
            : undefined,
        }}
      />
      {mode === 'text' ? (
        <VerseList
          items={query ? verses : []}
          bottomInset={bottomInset}
          header={
            <VerseListHeader>
              {controls}
              {query && verses ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {textLoading ? t('Searching…') : verses.length >= LIMIT ? t('First {count} verses', { count: LIMIT }) : t('{count} verses', { count: verses.length })}
                </ThemedText>
              ) : null}
            </VerseListHeader>
          }
          empty={
            query ? (
              <Empty title={t('Nothing found')} message={t('Words match by their start (“love” finds “loved”); put a phrase in "quotes".')} />
            ) : (
              <Empty title={t('Search the Bible')} message={t('Type above to search {version}.', { version: version?.name ?? t('the current version') })} />
            )
          }
        />
      ) : (
        <FlatList
          data={query ? entries : []}
          keyExtractor={(e) => e.number}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="on-drag"
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={{ paddingBottom: bottomInset }}
          ListHeaderComponent={<VerseListHeader>{controls}</VerseListHeader>}
          ListEmptyComponent={
            query ? (
              entries ? <Empty title={t("No Strong's entries found")} /> : null
            ) : (
              <Empty title={t("Strong's dictionary")} message={t('Search by English meaning (“wisdom”), transliteration (“sophia”) or number (“G4678”).')} />
            )
          }
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
              detail={`${item.verses}`}
              chevron
              onPress={() => router.push({ pathname: '/strongs/[number]', params: { number: item.number } })}
            />
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  controls: { gap: Spacing.two },
});
