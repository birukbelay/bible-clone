/** Tag the selected verses (?ranges=...): toggle existing tags or create one inline. */
import { Q } from '@nozbe/watermelondb';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getBooks, useAsync } from '@/bible/queries';
import { decodeRanges, formatRef } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { notify } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Field, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database, type Tag, type VerseTag } from '@/db';
import { createTag, overlapping, tagVerses, untagVerses } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function TagVersesScreen() {
  const theme = useTheme();
  const t = useT();
  const { ranges: param } = useLocalSearchParams<{ ranges: string }>();
  const ranges = decodeRanges(param);
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const [name, setName] = useState('');

  const tagRecords = useQuery(() => database.get<Tag>('tags').query(Q.sortBy('name', Q.asc)), [], ['name', 'color']);
  const links = useQuery(
    () => database.get<VerseTag>('verse_tags').query(Q.or(...ranges.map((r) => Q.and(...overlapping(r.ari, r.ariEnd))))),
    [param],
  );

  if (!ranges.length) return <Empty title={t('No verses selected')} />;

  const tagged = new Set(links?.map((l) => l.tagId));
  const tags = tagRecords?.map((tag) => ({ id: tag.id, name: tag.name, color: tag.color }));
  const fail = (e: Error) => notify(t('Could not update tags'), e.message);

  const toggle = (id: string) => (tagged.has(id) ? untagVerses(id, ranges) : tagVerses(id, ranges)).catch(fail);

  const create = async () => {
    const clean = name.trim();
    if (!clean) return;
    const existing = tags?.find((tag) => tag.name.toLowerCase() === clean.toLowerCase());
    try {
      const id = existing?.id ?? (await createTag(clean)).id;
      await tagVerses(id, ranges);
      setName('');
    } catch (e) {
      fail(e as Error);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="tint">
          {ranges.map((r) => formatRef(books, r.ari, r.ariEnd)).join('; ')}
        </ThemedText>
        <View style={styles.newTag}>
          <Field
            value={name}
            onChangeText={setName}
            placeholder={t('New tag')}
            returnKeyType="done"
            onSubmitEditing={create}
            style={styles.input}
          />
          <Button title={t('Add')} icon={Icons.add} disabled={!name.trim()} onPress={create} />
        </View>
      </View>
      {tags?.length === 0 && <Empty title={t('No tags yet')} message={t('Type a name above to create your first tag.')} />}
      {tags?.map((tag) => (
        <Row
          key={tag.id}
          title={tag.name}
          left={<View style={[styles.dot, { backgroundColor: tag.color }]} />}
          right={tagged.has(tag.id) ? <Icon name={Icons.check} color={theme.tint} /> : null}
          onPress={() => toggle(tag.id)}
        />
      ))}
      <View style={styles.footer}>
        <Button kind="plain" title={t('Done')} onPress={() => router.back()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.three, gap: Spacing.three },
  newTag: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  footer: { padding: Spacing.three },
});
