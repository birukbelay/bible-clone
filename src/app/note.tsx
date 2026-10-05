/**
 * Write or edit a note. New note: ?ranges=<ari-ariEnd>&version=<id>; existing: ?id=<note id>.
 * Saving an empty note deletes it.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { getBooks, getRange, useAsync } from '@/bible/queries';
import { decodeRanges, formatRef } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Field, IconButton, Loading } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { Spacing } from '@/constants/theme';
import { database, type Note } from '@/db';
import { deleteRecord, saveNote } from '@/db/actions';
import { useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function NoteScreen() {
  const params = useLocalSearchParams<{ id?: string; ranges?: string; version?: string }>();
  const note = useRecord(
    () => (params.id ? database.get<Note>('notes').find(params.id) : null),
    (n) => ({ ari: n.ari, ariEnd: n.ariEnd, body: n.body }),
    [params.id],
  );

  if (params.id && note === undefined) return <Loading />;
  if (params.id && !note) return <Empty title="This note was deleted" />;

  const range = note ? { ari: note.ari, ariEnd: note.ariEnd } : decodeRanges(params.ranges)[0];
  if (!range) return <Empty title="No verse selected" />;

  return (
    <NoteEditor
      key={params.id ?? params.ranges}
      record={note?.record ?? null}
      initialBody={note?.body ?? ''}
      range={range}
      versionId={params.version ?? null}
    />
  );
}

function NoteEditor({
  record,
  initialBody,
  range,
  versionId,
}: {
  record: Note | null;
  initialBody: string;
  range: { ari: number; ariEnd: number };
  versionId: string | null;
}) {
  const theme = useTheme();
  const version = useCurrentVersion();
  const currentId = version?.id ?? '';
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const { data: books } = useAsync(() => getBooks(currentId), [currentId]);
  const { data: verses } = useAsync(() => getRange(currentId, range.ari, range.ariEnd), [currentId, range.ari, range.ariEnd]);

  const save = () => {
    setSaving(true);
    saveNote(record, range, body, versionId ?? currentId).then(
      () => router.back(),
      (e: Error) => {
        setSaving(false);
        Alert.alert('Could not save', e.message);
      },
    );
  };

  const remove = () =>
    record &&
    Alert.alert('Delete this note?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRecord(record).then(() => router.back()) },
    ]);

  return (
    <>
      <Stack.Screen
        options={{
          title: formatRef(books, range.ari, range.ariEnd),
          headerRight: record
            ? () => <IconButton icon={Icons.trash} label="Delete note" color={theme.danger} onPress={remove} />
            : undefined,
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="smallBold" themeColor="tint">
          {formatRef(books, range.ari, range.ariEnd)}
        </ThemedText>
        <View style={styles.verses}>
          {verses?.map((v) => (
            <VerseText key={v.ari} text={v.text} label={verses.length > 1 ? v.label : undefined} fontSize={15} numberOfLines={6} />
          ))}
        </View>
        <Field
          value={body}
          onChangeText={setBody}
          placeholder="Write a note…"
          multiline
          autoFocus={!record}
          textAlignVertical="top"
          style={styles.input}
        />
        <Button title={saving ? 'Saving…' : 'Save'} icon={Icons.check} disabled={saving || body === initialBody} onPress={save} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  verses: { gap: Spacing.one },
  input: { minHeight: 180 },
});
