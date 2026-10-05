/** One topic: its Strong's words and every verse that uses them. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getStrongs, versesForStrongs } from '@/bible/strongs';
import { useAsync } from '@/bible/queries';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Empty, IconButton, Loading, Segmented } from '@/components/ui';
import { VerseList, VerseListHeader, type VerseListItem } from '@/components/verse-list';
import { Spacing } from '@/constants/theme';
import { database, type Topic, type TopicMode, type TopicStrong } from '@/db';
import { removeTopicStrong, updateTopic } from '@/db/actions';
import { useQuery, useRecord } from '@/db/hooks';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';

export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const bottomInset = useTabBottomInset();

  const topic = useRecord(
    () => database.get<Topic>('topics').find(id),
    (t) => ({ name: t.name, description: t.description, mode: t.mode }),
    [id],
  );
  const words = useQuery(
    () => database.get<TopicStrong>('topic_strongs').query(Q.where('topic_id', id), Q.sortBy('strong', Q.asc)),
    [id],
    ['strong'],
  );
  const numbers = words?.map((w) => w.strong) ?? [];
  const numbersKey = numbers.join(',');
  const mode = topic?.mode ?? 'any';

  const { data: entries } = useAsync(() => getStrongs(numbers), [numbersKey]);
  const { data: verses, loading } = useAsync(async () => {
    const found = await versesForStrongs(numbers, mode);
    return found.map<VerseListItem>((v) => ({ key: String(v.ari), ari: v.ari, ariEnd: v.ari }));
  }, [numbersKey, mode]);

  if (topic === undefined) return <Loading />;
  if (topic === null) return <Empty title="This topic was deleted" />;

  const emphasize = new Set(numbers);
  const entryOf = new Map(entries?.map((e) => [e.number, e]));

  const header = (
    <VerseListHeader>
      {topic.description ? <ThemedText themeColor="textSecondary">{topic.description}</ThemedText> : null}
      <View style={styles.words}>
        {words?.map((w) => {
          const entry = entryOf.get(w.strong);
          return (
            <Chip
              key={w.id}
              label={entry?.xlit ? `${w.strong} ${entry.xlit}` : w.strong}
              onPress={() => router.push({ pathname: '/strongs/[number]', params: { number: w.strong } })}
              right={
                <IconButton icon={Icons.close} size={14} label={`Remove ${w.strong}`} color={theme.textSecondary} onPress={() => removeTopicStrong(w)} />
              }
            />
          );
        })}
        <Chip
          label="Add words"
          onPress={() => router.push({ pathname: '/strongs-search', params: { topicId: id } })}
          right={<Icon name={Icons.add} size={14} color={theme.tint} />}
        />
      </View>
      {numbers.length > 1 && (
        <Segmented<TopicMode>
          options={[
            { value: 'any', label: 'Any of the words' },
            { value: 'all', label: 'All of the words' },
          ]}
          value={mode}
          onChange={(m) => updateTopic(topic.record, { mode: m })}
        />
      )}
      {numbers.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {loading ? 'Searching…' : `${verses?.length ?? 0} verses`}
        </ThemedText>
      )}
    </VerseListHeader>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: topic.name,
          headerRight: () => (
            <IconButton
              icon={Icons.note}
              label="Edit topic"
              color={theme.tint}
              onPress={() => router.push({ pathname: '/topic-edit', params: { id } })}
            />
          ),
        }}
      />
      <VerseList
        items={numbers.length ? verses : []}
        header={header}
        emphasize={emphasize}
        bottomInset={bottomInset}
        empty={
          numbers.length ? (
            <Empty title="No verses" message={mode === 'all' ? 'No verse uses all of these words. Try "Any".' : undefined} />
          ) : (
            <Empty title="No words yet" message={'Add Strong\'s words, e.g. search "wisdom" and pick H2451 and G4678.'}>
              <Button
                title="Add words"
                icon={Icons.add}
                onPress={() => router.push({ pathname: '/strongs-search', params: { topicId: id } })}
              />
            </Empty>
          )
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
