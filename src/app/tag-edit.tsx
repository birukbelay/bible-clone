/** Create a tag, or rename/recolor/delete one (?id=). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, Icons } from '@/components/icon';
import { Button, Empty, Field, Loading } from '@/components/ui';
import { Spacing, TagColors } from '@/constants/theme';
import { database, type Tag } from '@/db';
import { createTag, deleteTag, updateTag } from '@/db/actions';
import { useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function TagEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const tag = useRecord(
    () => (id ? database.get<Tag>('tags').find(id) : null),
    (t) => ({ name: t.name, color: t.color }),
    [id],
  );
  if (id && tag === undefined) return <Loading />;
  if (id && !tag) return <Empty title="This tag was deleted" />;
  return <TagForm key={id ?? 'new'} record={tag?.record ?? null} initialName={tag?.name ?? ''} initialColor={tag?.color} />;
}

function TagForm({ record, initialName, initialColor }: { record: Tag | null; initialName: string; initialColor?: string }) {
  const theme = useTheme();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string>(initialColor ?? TagColors[0]);
  const fail = (e: Error) => Alert.alert('Could not save the tag', e.message);

  const save = () =>
    (record ? updateTag(record, name, color) : createTag(name, color)).then(() => router.back(), fail);

  const remove = () =>
    record &&
    Alert.alert(`Delete “${record.name}”?`, 'The tag is removed from every verse.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteTag(record).then(() => router.dismissTo('/library'), fail),
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Field value={name} onChangeText={setName} placeholder="Tag name" autoFocus={!record} returnKeyType="done" onSubmitEditing={save} />
      <View style={styles.colors}>
        {TagColors.map((c) => (
          <Pressable
            key={c}
            accessibilityLabel={`Color ${c}`}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }]}>
            {c === color && <Icon name={Icons.check} size={18} color="#ffffff" />}
          </Pressable>
        ))}
      </View>
      <Button title={record ? 'Save' : 'Create tag'} icon={Icons.check} disabled={!name.trim()} onPress={save} />
      {record && <Button kind="danger" title="Delete tag" icon={Icons.trash} onPress={remove} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  colors: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
