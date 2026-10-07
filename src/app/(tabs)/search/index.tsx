/**
 * Search: full-text search of the current version, or the Strong's dictionary. A typed reference
 * ("jn 3 16") offers to open it; results can be narrowed to one book; recent searches are kept.
 */
import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { BOOK_COUNT, bookOf } from '@/bible/ari';
import { parseRef } from '@/bible/parse-ref';
import { bookName, getBooks, searchText, useAsync, type SearchScope } from '@/bible/queries';
import { formatRef, openInReader } from '@/bible/reference';
import { searchStrongs } from '@/bible/strongs';
import { useCurrentVersion } from '@/bible/versions';
import { ThemedText } from '@/components/themed-text';
import { Icon, Icons } from '@/components/icon';
import { Chip, Empty, Field, IconButton, Row, Segmented } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

type Mode = 'text' | 'strongs';
type Scope = 'all' | 'ot' | 'nt' | 'dc';

const LIMIT = 500;
const HISTORY = 15;
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
  const { data: books } = useAsync(() => (versionId ? getBooks(versionId) : Promise.resolve([])), [versionId]);
  const hasExtraBooks = !!books?.some((b) => b.book >= BOOK_COUNT);
  const where: Scope = scope === 'dc' && !hasExtraBooks ? 'all' : scope;

  const { data: verses, loading: textLoading } = useAsync(async () => {
    if (mode !== 'text' || !query || !versionId) return undefined;
    const rows = await searchText(versionId, query, where satisfies SearchScope, LIMIT);
    return rows.map<VerseListItem>((v) => ({ key: String(v.ari), ari: v.ari, ariEnd: v.ari_end }));
  }, [mode, query, where, versionId]);

  // narrowed to one book by its chip; a new search shows all again
  const [bookFilter, setBookFilter] = useState<{ query: string; book: number } | null>(null);
  const filterBook = bookFilter?.query === query ? bookFilter.book : null;
  const counts = new Map<number, number>();
  for (const v of verses ?? []) counts.set(bookOf(v.ari), (counts.get(bookOf(v.ari)) ?? 0) + 1);
  const shown = filterBook == null ? verses : verses?.filter((v) => bookOf(v.ari) === filterBook);

  const [history, setHistory] = useSetting(settings.searchHistory);
  const remember = (q: string) => setHistory([q, ...settings.searchHistory.get().filter((h) => h !== q)].slice(0, HISTORY));
  // searches that found something are kept
  useEffect(() => {
    if (mode === 'text' && query && verses?.length) remember(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verses]);

  const ref = mode === 'text' && input.trim() ? parseRef(input, books) : null;

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
            ...(hasExtraBooks ? [{ value: 'dc' as const, label: t('Deuterocanon') }] : []),
          ]}
          value={where}
          onChange={setScope}
        />
      )}
      {ref && (
        <Row
          left={<Icon name={Icons.goTo} size={20} color={theme.tint} />}
          title={t('Open {ref}', { ref: formatRef(books, ref.ari, ref.ariEnd) })}
          chevron
          onPress={() => {
            remember(input.trim());
            openInReader(ref.ari);
          }}
        />
      )}
      {mode === 'text' && query && counts.size > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t('All ({count})', { count: verses?.length ?? 0 })} selected={filterBook == null} onPress={() => setBookFilter(null)} />
          {[...counts].map(([book, count]) => (
            <Chip
              key={book}
              label={`${bookName(books, book << 16, true)} (${count})`}
              selected={filterBook === book}
              onPress={() => setBookFilter(filterBook === book ? null : { query, book })}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const recent =
    !input.trim() && history.length ? (
      <View style={styles.recent}>
        <View style={styles.recentHeader}>
          <ThemedText type="smallBold" themeColor="textSecondary" style={styles.fill}>
            {t('Recent searches')}
          </ThemedText>
          <IconButton icon={Icons.trash} label={t('Clear recent searches')} size={18} color={theme.textSecondary} onPress={() => setHistory([])} />
        </View>
        <View style={styles.wrap}>
          {history.map((h) => (
            <Chip key={h} label={h} onPress={() => setInput(h)} onLongPress={() => setHistory(history.filter((x) => x !== h))} />
          ))}
        </View>
      </View>
    ) : null;

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
          items={query ? shown : []}
          bottomInset={bottomInset}
          header={
            <VerseListHeader>
              {controls}
              {query && verses ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {textLoading ? t('Searching…') : verses.length >= LIMIT ? t('First {count} verses', { count: LIMIT }) : t('{count} verses', { count: verses.length })}
                </ThemedText>
              ) : null}
              {recent}
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
  chips: { gap: Spacing.two },
  recent: { gap: Spacing.two, paddingTop: Spacing.two },
  recentHeader: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  fill: { flex: 1 },
});
