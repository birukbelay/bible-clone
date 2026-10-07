/** Library: everything the user marked - bookmarks, notes, highlights, tags. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { confirm } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, Row, Segmented } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { HighlightColors, Spacing } from '@/constants/theme';
import { database, type Bookmark, type Highlight, type Note, type Tag, type VerseTag } from '@/db';
import { deleteRecord } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { t as translate, useT } from '@/i18n';

type Section = 'bookmarks' | 'notes' | 'highlights' | 'tags';

/** English keys, translated with t() */
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'bookmarks', label: 'Bookmarks' },
  { value: 'notes', label: 'Notes' },
  { value: 'highlights', label: 'Highlights' },
  { value: 'tags', label: 'Tags' },
];

export default function LibraryScreen() {
  const theme = useTheme();
  const t = useT();
  // the reader's drawer opens this tab on a given section
  const { section: requested } = useLocalSearchParams<{ section?: Section }>();
  const [section, setSection] = useState<Section>(requested ?? 'bookmarks');
  const [lastRequested, setLastRequested] = useState(requested);
  if (requested !== lastRequested) {
    setLastRequested(requested);
    if (requested) setSection(requested);
  }
  const bottomInset = useTabBottomInset();
  const header = (
    <VerseListHeader>
      <Segmented options={SECTIONS.map((s) => ({ value: s.value, label: t(s.label) }))} value={section} onChange={setSection} />
    </VerseListHeader>
  );
  return (
    <>
      <Stack.Screen
        options={{
          headerRight:
            section === 'tags'
              ? () => <IconButton icon={Icons.add} label={t('New tag')} color={theme.tint} onPress={() => router.push('/tag-edit')} />
              : undefined,
        }}
      />
      {section === 'bookmarks' && <Bookmarks header={header} bottomInset={bottomInset} />}
      {section === 'notes' && <Notes header={header} bottomInset={bottomInset} />}
      {section === 'highlights' && <Highlights header={header} bottomInset={bottomInset} />}
      {section === 'tags' && <Tags header={header} bottomInset={bottomInset} />}
    </>
  );
}

type SectionProps = { header: ReactElement; bottomInset: number };

const recentFirst = Q.sortBy('created_at', Q.desc);

/** `title`: already translated */
function confirmDelete(title: string, onDelete: () => void) {
  confirm({ title, confirmText: translate('Delete'), destructive: true }).then((ok) => {
    if (ok) onDelete();
  });
}

function Bookmarks({ header, bottomInset }: SectionProps) {
  const t = useT();
  const records = useQuery(() => database.get<Bookmark>('bookmarks').query(recentFirst), [], ['title']);
  const byKey = new Map(records?.map((r) => [r.id, r]));
  const items = records?.map<VerseListItem & { title: string | null }>((r) => ({ key: r.id, ari: r.ari, ariEnd: r.ariEnd, title: r.title }));
  const titles = new Map(items?.map((i) => [i.key, i.title]));
  return (
    <VerseList
      items={items}
      header={header}
      bottomInset={bottomInset}
      empty={<Empty title={t('No bookmarks')} message={t('Select verses in the reader and tap Bookmark.')} />}
      renderExtra={(item) =>
        titles.get(item.key) ? (
          <ThemedText type="small" themeColor="textSecondary">
            {titles.get(item.key)}
          </ThemedText>
        ) : null
      }
      onLongPress={(item) => {
        const record = byKey.get(item.key);
        if (record) confirmDelete(t('Delete this bookmark?'), () => deleteRecord(record));
      }}
    />
  );
}

function Notes({ header, bottomInset }: SectionProps) {
  const theme = useTheme();
  const t = useT();
  const records = useQuery(() => database.get<Note>('notes').query(Q.sortBy('updated_at', Q.desc)), [], ['body']);
  const bodies = new Map(records?.map((r) => [r.id, r.body]));
  const items = records?.map<VerseListItem>((r) => ({ key: r.id, ari: r.ari, ariEnd: r.ariEnd }));
  return (
    <VerseList
      items={items}
      header={header}
      bottomInset={bottomInset}
      empty={<Empty title={t('No notes')} message={t('Select a verse in the reader and tap Note.')} />}
      renderExtra={(item) => (
        <View style={[styles.note, { borderLeftColor: theme.tint }]}>
          <ThemedText type="small" numberOfLines={6} style={styles.noteText}>
            {bodies.get(item.key)}
          </ThemedText>
          <IconButton
            icon={Icons.note}
            size={18}
            color={theme.tint}
            label={t('Edit note')}
            onPress={() => router.push({ pathname: '/note', params: { id: item.key } })}
          />
        </View>
      )}
      onLongPress={(item) => router.push({ pathname: '/note', params: { id: item.key } })}
    />
  );
}

function Highlights({ header, bottomInset }: SectionProps) {
  const t = useT();
  const records = useQuery(() => database.get<Highlight>('highlights').query(Q.sortBy('ari', Q.asc)), [], ['color']);
  const byKey = new Map(records?.map((r) => [r.id, r]));
  const colors = new Map(records?.map((r) => [r.id, r.color]));
  const items = records?.map<VerseListItem>((r) => ({ key: r.id, ari: r.ari, ariEnd: r.ariEnd }));
  return (
    <VerseList
      items={items}
      header={header}
      bottomInset={bottomInset}
      empty={<Empty title={t('No highlights')} message={t('Select verses in the reader and pick a color.')} />}
      renderExtra={(item) => (
        <View style={[styles.swatch, { backgroundColor: HighlightColors[colors.get(item.key) ?? 0] }]} />
      )}
      onLongPress={(item) => {
        const record = byKey.get(item.key);
        if (record) confirmDelete(t('Delete this highlight?'), () => deleteRecord(record));
      }}
    />
  );
}

function Tags({ header, bottomInset }: SectionProps) {
  const theme = useTheme();
  const t = useT();
  const tags = useQuery(() => database.get<Tag>('tags').query(Q.sortBy('name', Q.asc)), [], ['name', 'color']);
  const links = useQuery(() => database.get<VerseTag>('verse_tags').query(), []);
  const counts = new Map<string, number>();
  links?.forEach((l) => counts.set(l.tagId, (counts.get(l.tagId) ?? 0) + 1));
  const items = tags?.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color, count: counts.get(tag.id) ?? 0 }));
  return (
    <FlatList
      data={items}
      keyExtractor={(tag) => tag.id}
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: bottomInset }}
      ListHeaderComponent={header}
      ListEmptyComponent={
        items ? (
          <Empty title={t('No tags')} message={t('Tags group verses by subject, e.g. Promises or Prayer.')}>
            <Button title={t('Create a tag')} icon={Icons.add} onPress={() => router.push('/tag-edit')} />
          </Empty>
        ) : null
      }
      renderItem={({ item }) => (
        <Row
          left={<View style={[styles.tagDot, { backgroundColor: item.color }]} />}
          title={item.name}
          detail={`${item.count}`}
          chevron
          onPress={() => router.push({ pathname: '/library/tags/[id]', params: { id: item.id } })}
          onLongPress={() => router.push({ pathname: '/tag-edit', params: { id: item.id } })}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, borderLeftWidth: 3, paddingLeft: Spacing.two, marginTop: Spacing.one },
  noteText: { flex: 1 },
  swatch: { width: 36, height: 8, borderRadius: 4, marginTop: Spacing.one },
  tagDot: { width: 14, height: 14, borderRadius: 7 },
});
