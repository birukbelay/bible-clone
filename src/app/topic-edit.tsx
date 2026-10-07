/** Create a topic (then pick its Strong's words), or rename/describe/delete one (?id=). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { confirm, notify } from '@/components/dialogs';
import { ThemedText } from '@/components/themed-text';
import { Icons } from '@/components/icon';
import { Button, Empty, Field, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database, type Topic } from '@/db';
import { createTopic, deleteTopic, updateTopic } from '@/db/actions';
import { useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function TopicEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const t = useT();
  const topic = useRecord(
    () => (id ? database.get<Topic>('topics').find(id) : null),
    (p) => ({ name: p.name, description: p.description }),
    [id],
  );
  if (id && topic === undefined) return <Loading />;
  if (id && !topic) return <Empty title={t('This topic was deleted')} />;
  return (
    <TopicForm
      key={id ?? 'new'}
      record={topic?.record ?? null}
      initialName={topic?.name ?? ''}
      initialDescription={topic?.description ?? ''}
    />
  );
}

function TopicForm({
  record,
  initialName,
  initialDescription,
}: {
  record: Topic | null;
  initialName: string;
  initialDescription: string;
}) {
  const theme = useTheme();
  const t = useT();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const fail = (e: Error) => notify(t('Could not save the topic'), e.message);

  const save = async () => {
    try {
      if (record) {
        await updateTopic(record, { name, description });
        router.back();
      } else {
        const topic = await createTopic(name, [], description);
        // open the new topic and go straight to picking its words
        router.dismiss();
        router.push({ pathname: '/topics/[id]', params: { id: topic.id } });
        router.push({ pathname: '/strongs-search', params: { topicId: topic.id, query: name.trim() } });
      }
    } catch (e) {
      fail(e as Error);
    }
  };

  const remove = () =>
    record &&
    confirm({
      title: t('Delete “{name}”?', { name: record.name }),
      message: t('Only the topic is deleted; the dictionary is not changed.'),
      confirmText: t('Delete'),
      destructive: true,
    }).then((ok) => {
      if (ok) deleteTopic(record).then(() => router.dismissTo('/topics'), fail);
    });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Field value={name} onChangeText={setName} placeholder={t('Name, e.g. Wisdom')} autoFocus={!record} />
      <Field
        value={description}
        onChangeText={setDescription}
        placeholder={t('Description (optional)')}
        multiline
        textAlignVertical="top"
        style={styles.description}
      />
      {!record && (
        <ThemedText type="small" themeColor="textSecondary">
          {t("Next you choose the Hebrew and Greek words (Strong's numbers) that make up this topic.")}
        </ThemedText>
      )}
      <Button title={record ? t('Save') : t('Create and add words')} icon={Icons.check} disabled={!name.trim()} onPress={save} />
      {record && <Button kind="danger" title={t('Delete topic')} icon={Icons.trash} onPress={remove} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  description: { minHeight: 90 },
});
