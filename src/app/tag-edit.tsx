/** Create a tag, or rename/recolor/delete one (?id=). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { confirm, notify } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { Button, Empty, Field, Loading } from '@/components/ui';
import { Spacing, TagColors } from '@/constants/theme';
import { database, type Tag } from '@/db';
import { createTag, deleteTag, updateTag } from '@/db/actions';
import { useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function TagEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT();
  const tag = useRecord(
    () => (id ? database.get<Tag>('tags').find(id) : null),
    (tg) => ({ name: tg.name, color: tg.color }),
    [id],
  );
  if (id && tag === undefined) return <Loading />;
  if (id && !tag) return <Empty title={t('This tag was deleted')} />;
  return <TagForm key={id ?? 'new'} record={tag?.record ?? null} initialName={tag?.name ?? ''} initialColor={tag?.color} />;
}

function TagForm({ record, initialName, initialColor }: { record: Tag | null; initialName: string; initialColor?: string }) {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const t = useT();
  const [color, setColor] = useState<string>(initialColor ?? TagColors[0]);
  const fail = (e: Error) => notify(t('Could not save the tag'), e.message);

  const save = () =>
    (record ? updateTag(record, name, color) : createTag(name, color)).then(() => router.back(), fail);

  const remove = () =>
    record &&
    confirm({
      title: t('Delete “{name}”?', { name: record.name }),
      message: t('The tag is removed from every verse.'),
      confirmText: t('Delete'),
      destructive: true,
    }).then((ok) => {
      if (ok) deleteTag(record).then(() => router.dismissTo('/library'), fail);
    });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Field value={name} onChangeText={setName} placeholder={t('Tag name')} autoFocus={!record} returnKeyType="done" onSubmitEditing={save} />
      <View style={styles.colors}>
        {TagColors.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={t('Color {color}', { color: c })}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }]}>
            {c === color && <Icon name={Icons.check} size={18} color="#ffffff" />}
          </Pressable>
        ))}
      </View>
      <Button title={record ? t('Save') : t('Create tag')} icon={Icons.check} disabled={!name.trim()} onPress={save} />
      {record && <Button kind="danger" title={t('Delete tag')} icon={Icons.trash} onPress={remove} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
