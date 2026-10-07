/** Go to a book and chapter. */
import { router } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { bookOf, chapterOf, makeAri } from '@/bible/ari';
import { SECTION_NAMES, SECTIONS, sectionOf } from '@/bible/canon';
import { getBooks, useAsync, type Book } from '@/bible/queries';
import { useCurrentVersion } from '@/bible/versions';
import { ThemedText } from '@/components/themed-text';
import { Field, SectionHeader } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings } from '@/settings';

export default function PassageScreen() {
  const theme = useTheme();
  const t = useT();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const current = settings.position.get();
  const [book, setBook] = useState<Book | null>(null);
  const [filter, setFilter] = useState('');

  const go = (b: Book, chapter: number) => {
    settings.position.set(makeAri(b.book, chapter, 1));
    router.back();
  };

  if (book) {
    return (
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <Pressable onPress={() => setBook(null)} style={styles.back}>
          <ThemedText type="smallBold" themeColor="tint">
            ‹ {t('All books')}
          </ThemedText>
        </Pressable>
        <ThemedText type="subtitle" style={styles.bookTitle}>
          {book.name}
        </ThemedText>
        <View style={styles.grid}>
          {Array.from({ length: book.chapters }, (_, i) => i + 1).map((c) => {
            const here = bookOf(current) === book.book && chapterOf(current) === c;
            return (
              <Pressable
                key={c}
                onPress={() => go(book, c)}
                style={({ pressed }) => [
                  styles.cell,
                  { backgroundColor: here ? theme.tint : theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="smallBold" style={here && styles.onTint}>
                  {c}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  const q = filter.trim().toLowerCase();
  const shown = books?.filter((b) => !q || b.name.toLowerCase().includes(q) || b.abbr.toLowerCase().startsWith(q));
  const pick = (b: Book) => (b.chapters === 1 ? go(b, 1) : setBook(b));
  const section = (title: string, list: Book[] | undefined) =>
    list?.length ? (
      <>
        <SectionHeader title={title} />
        <View style={[styles.grid, styles.padded]}>
          {list.map((b) => {
            const here = bookOf(current) === b.book;
            return (
              <Pressable
                key={b.book}
                onPress={() => pick(b)}
                style={({ pressed }) => [
                  styles.bookCell,
                  { backgroundColor: here ? theme.backgroundSelected : theme.backgroundElement },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small" numberOfLines={1}>
                  {b.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </>
    ) : null;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
      <View style={styles.padded}>
        <Field
          value={filter}
          onChangeText={setFilter}
          placeholder={t('Find a book')}
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={() => shown?.length === 1 && pick(shown[0])}
        />
      </View>
      {SECTIONS.map((which) => (
        <Fragment key={which}>{section(t(SECTION_NAMES[which].title), shown?.filter((b) => sectionOf(b.book) === which))}</Fragment>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  list: { paddingTop: Spacing.three, paddingBottom: Spacing.five },
  padded: { paddingHorizontal: Spacing.three },
  back: { alignSelf: 'flex-start' },
  bookTitle: { fontSize: 26, lineHeight: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  cell: { width: 52, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookCell: { width: '31.5%', paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.two, borderRadius: 10 },
  pressed: { opacity: 0.6 },
  onTint: { color: '#ffffff' },
});
