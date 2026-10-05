/**
 * Pick Strong's words for a topic (?topicId=, optional ?query= to start with).
 * Searching "wisdom" matches the KJV usage too, so it finds H2451, H2449, G4678, G4680, ...
 */
import { Q } from '@nozbe/watermelondb';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';

import { useAsync } from '@/bible/queries';
import { searchStrongs } from '@/bible/strongs';
import { notify } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Field, Loading, Row } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { database, type TopicStrong } from '@/db';
import { addTopicStrongs } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';

export default function StrongsSearchScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ topicId: string; query?: string }>();
  const [query, setQuery] = useState(params.query ?? '');
  const debounced = useDebounced(query.trim(), 300);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: results, loading } = useAsync(() => searchStrongs(debounced, 100), [debounced]);
  const existing = useQuery(
    () => database.get<TopicStrong>('topic_strongs').query(Q.where('topic_id', params.topicId)),
    [params.topicId],
  );
  const inTopic = new Set(existing?.map((w) => w.strong));

  const toggle = (n: string) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));

  const save = () => {
    setSaving(true);
    addTopicStrongs(params.topicId, picked).then(
      () => router.back(),
      (e: Error) => {
        setSaving(false);
        notify('Could not add the words', e.message);
      },
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="English word, transliteration, or G/H number"
          autoCorrect={false}
          autoCapitalize="none"
          autoFocus={!params.query}
          clearButtonMode="while-editing"
        />
      </View>
      <FlatList
        data={results}
        keyExtractor={(e) => e.number}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading ? (
            <Loading />
          ) : debounced ? (
            <Empty title={`Nothing found for “${debounced}”`} />
          ) : (
            <Empty
              title="Find the words for this topic"
              message="Search an English word (it matches how the KJV translated each Hebrew/Greek word), a transliteration like sophia, or a number like H2451."
            />
          )
        }
        renderItem={({ item }) => {
          const already = inTopic.has(item.number);
          const selected = picked.includes(item.number);
          return (
            <Row
              title={
                <ThemedText>
                  <ThemedText type="smallBold" themeColor="tint">
                    {item.number}
                  </ThemedText>
                  {`  ${item.lemma ?? ''}  `}
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.xlit ?? ''}
                  </ThemedText>
                </ThemedText>
              }
              subtitle={already ? 'Already in this topic' : (item.usage ?? undefined)}
              detail={`${item.verses}`}
              right={
                <Icon
                  name={already || selected ? Icons.check : Icons.add}
                  color={already ? theme.textSecondary : selected ? theme.tint : theme.textSecondary}
                />
              }
              onPress={already ? undefined : () => toggle(item.number)}
              onLongPress={() => router.push({ pathname: '/strongs/[number]', params: { number: item.number } })}
            />
          );
        }}
      />
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {picked.length ? picked.join(', ') : Platform.OS === 'web' ? 'Click to select · right-click for the definition' : 'Tap to select · long-press for the definition'}
        </ThemedText>
        <Button
          title={picked.length ? `Add ${picked.length} word${picked.length > 1 ? 's' : ''}` : 'Add'}
          icon={Icons.check}
          disabled={!picked.length || saving}
          onPress={save}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { padding: Spacing.three },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    paddingBottom: Spacing.five,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  hint: { flex: 1 },
});
