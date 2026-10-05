/** Add Strong's numbers (?strongs=G4678,H2451) to an existing topic or a new one. */
import { Q } from '@nozbe/watermelondb';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { notify } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database, type Topic, type TopicStrong } from '@/db';
import { addTopicStrongs, createTopic } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';

export default function TopicPickerScreen() {
  const theme = useTheme();
  const { strongs: param } = useLocalSearchParams<{ strongs: string }>();
  const strongs = (param ?? '').split(',').filter(Boolean);
  const [name, setName] = useState('');

  const topicRecords = useQuery(() => database.get<Topic>('topics').query(Q.sortBy('name', Q.asc)), [], ['name']);
  const words = useQuery(
    () => database.get<TopicStrong>('topic_strongs').query(Q.where('strong', Q.oneOf(strongs))),
    [param],
  );
  const containing = new Set(words?.map((w) => w.topicId));
  const topics = topicRecords?.map((t) => ({ id: t.id, name: t.name }));
  const fail = (e: Error) => notify('Could not update the topic', e.message);

  const add = (id: string) => addTopicStrongs(id, strongs).then(() => router.back(), fail);
  const create = () => createTopic(name, strongs).then(() => router.back(), fail);

  return (
    <ScrollView style={{ backgroundColor: theme.background }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <ThemedText type="smallBold" themeColor="tint">
          {strongs.join(', ')}
        </ThemedText>
        <View style={styles.newTopic}>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="New topic"
            returnKeyType="done"
            onSubmitEditing={() => name.trim() && create()}
            style={styles.input}
          />
          <Button title="Create" icon={Icons.add} disabled={!name.trim()} onPress={create} />
        </View>
      </View>
      {topics?.map((t) => {
        const has = containing.has(t.id);
        return (
          <Row
            key={t.id}
            title={t.name}
            left={<Icon name={Icons.topic} color={theme.textSecondary} />}
            right={has ? <Icon name={Icons.check} color={theme.tint} /> : null}
            subtitle={has ? 'Already contains this word' : undefined}
            onPress={has ? undefined : () => add(t.id)}
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: Spacing.three, gap: Spacing.three },
  newTopic: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  input: { flex: 1 },
});
