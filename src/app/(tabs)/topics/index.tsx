/** Topics: user-made subjects ("Wisdom") grouping several Strong's words. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database, type Topic, type TopicStrong } from '@/db';
import { useQuery } from '@/db/hooks';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

export default function TopicsScreen() {
  const theme = useTheme();
  const t = useT();
  const bottomInset = useTabBottomInset();
  const topics = useQuery(() => database.get<Topic>('topics').query(Q.sortBy('name', Q.asc)), [], ['name', 'description']);
  const words = useQuery(() => database.get<TopicStrong>('topic_strongs').query(), [], ['strong']);

  const wordsByTopic = new Map<string, string[]>();
  words?.forEach((w) => wordsByTopic.set(w.topicId, [...(wordsByTopic.get(w.topicId) ?? []), w.strong]));

  const items = topics?.map((p) => ({ id: p.id, name: p.name, description: p.description, words: wordsByTopic.get(p.id) ?? [] }));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon={Icons.add} label={t('New topic')} color={theme.tint} onPress={() => router.push('/topic-edit')} />
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: bottomInset }}
        style={{ backgroundColor: theme.background }}
        ListEmptyComponent={
          items ? (
            <Empty
              title={t('No topics yet')}
              message={t('A topic groups Strong\'s words, e.g. “Wisdom” = H2451 chokmâh + G4678 sophía. Open it to read every verse that uses them, in any version.')}>
              <Button title={t('Create a topic')} icon={Icons.add} onPress={() => router.push('/topic-edit')} />
            </Empty>
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            title={<ThemedText type="smallBold">{item.name}</ThemedText>}
            subtitle={
              <View style={styles.subtitle}>
                {item.description ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                    {item.description}
                  </ThemedText>
                ) : null}
                <ThemedText type="small" themeColor="tint" numberOfLines={1}>
                  {item.words.length ? item.words.join(' · ') : t('No words yet')}
                </ThemedText>
              </View>
            }
            chevron
            onPress={() => router.push({ pathname: '/topics/[id]', params: { id: item.id } })}
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { gap: Spacing.half },
});
