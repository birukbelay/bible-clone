/** Verses with one tag. Long-press a verse to remove the tag from it. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack, useLocalSearchParams } from 'expo-router';

import { confirm } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { Empty, IconButton, Loading } from '@/components/ui';
import { VerseList, type VerseListItem } from '@/components/verse-list';
import { database, type Tag, type VerseTag } from '@/db';
import { deleteRecord } from '@/db/actions';
import { useQuery, useRecord } from '@/db/hooks';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';

export default function TagScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const bottomInset = useTabBottomInset();
  const tag = useRecord(
    () => database.get<Tag>('tags').find(id),
    (t) => ({ name: t.name, color: t.color }),
    [id],
  );
  const links = useQuery(
    () => database.get<VerseTag>('verse_tags').query(Q.where('tag_id', id), Q.sortBy('ari', Q.asc)),
    [id],
  );
  const byKey = new Map(links?.map((l) => [l.id, l]));
  const items = links?.map<VerseListItem>((l) => ({ key: l.id, ari: l.ari, ariEnd: l.ariEnd }));

  if (tag === undefined) return <Loading />;
  if (tag === null) return <Empty title="This tag was deleted" />;

  return (
    <>
      <Stack.Screen
        options={{
          title: tag.name,
          headerRight: () => (
            <IconButton
              icon={Icons.note}
              label="Edit tag"
              color={theme.tint}
              onPress={() => router.push({ pathname: '/tag-edit', params: { id } })}
            />
          ),
        }}
      />
      <VerseList
        items={items}
        bottomInset={bottomInset}
        empty={<Empty title="No verses with this tag" message="Select verses in the reader and tap Tag." />}
        onLongPress={(item) => {
          const link = byKey.get(item.key);
          if (!link) return;
          confirm({ title: `Remove "${tag.name}" from this verse?`, confirmText: 'Remove', destructive: true }).then(
            (ok) => {
              if (ok) deleteRecord(link);
            },
          );
        }}
      />
    </>
  );
}
