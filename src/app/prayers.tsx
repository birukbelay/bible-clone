/** Prayer list: requests still being prayed for, then answered ones with the day they were answered. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { getBooks, useAsync } from '@/bible/queries';
import { formatRef } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { useDates } from '@/calendar';
import { showError } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { Empty, IconButton, Row, SectionHeader, Segmented } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { database, type Prayer } from '@/db';
import { setPrayerAnswered } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

type Item = {
  id: string;
  title: string;
  body: string | null;
  ari: number | null;
  ariEnd: number | null;
  answeredAt: number | null;
  createdAt: number;
  record: Prayer;
};

export default function PrayersScreen() {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [show, setShow] = useState<'praying' | 'answered' | 'all'>('praying');
  const records = useQuery(() => database.get<Prayer>('prayers').query(Q.sortBy('created_at', Q.desc)), [], [
    'title',
    'body',
    'ari',
    'answered_at',
  ]);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const items: Item[] =
    records?.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      ari: p.ari,
      ariEnd: p.ariEnd,
      answeredAt: p.answeredAt,
      createdAt: p.createdAt.getTime(),
      record: p,
    })) ?? [];
  const praying = items.filter((p) => p.answeredAt == null);
  const answered = items.filter((p) => p.answeredAt != null).sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));
  const sections = [
    ...(show !== 'answered' && praying.length ? [{ key: 'praying', title: t('Praying for'), data: praying }] : []),
    ...(show !== 'praying' && answered.length ? [{ key: 'answered', title: t('Answered'), data: answered }] : []),
  ];

  const add = () => router.push('/prayer-edit' as Href);
  const toggle = (p: Item) => setPrayerAnswered(p.record, p.answeredAt == null).catch(showError(t('Could not save')));
  const subtitle = (p: Item) =>
    [
      p.ari != null ? formatRef(books, p.ari, p.ariEnd ?? p.ari) : null,
      p.answeredAt != null
        ? t('Answered {date}', { date: dates.format(p.answeredAt, { day: true, month: 'short', year: true }) })
        : t('Since {date}', { date: dates.format(p.createdAt, { day: true, month: 'short', year: true }) }),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <>
      <Stack.Screen
        options={{
          title: t('Prayer list'),
          headerRight: () => <IconButton icon={Icons.add} label={t('New prayer')} color={theme.tint} onPress={add} />,
        }}
      />
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          items.length ? (
            <View style={styles.filter}>
              <Segmented
                options={[
                  { value: 'praying', label: t('Praying for') },
                  { value: 'answered', label: t('Answered') },
                  { value: 'all', label: t('All') },
                ]}
                value={show}
                onChange={setShow}
              />
            </View>
          ) : null
        }
        renderSectionHeader={({ section }) => <SectionHeader title={`${section.title} (${section.data.length})`} />}
        ListEmptyComponent={
          records ? (
            <Empty
              title={items.length ? t('Nothing here') : t('No prayers yet')}
              message={items.length ? undefined : t('Keep the people and things you pray for, and mark them when they are answered.')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            title={item.title}
            subtitle={item.body ? `${item.body.split('\n')[0]}\n${subtitle(item)}` : subtitle(item)}
            onPress={() => router.push(`/prayer-edit?id=${item.id}` as Href)}
            right={
              <IconButton
                icon={item.answeredAt != null ? Icons.checkCircle : Icons.circle}
                label={item.answeredAt != null ? t('Mark as not answered') : t('Mark as answered')}
                color={item.answeredAt != null ? theme.tint : theme.textSecondary}
                onPress={() => toggle(item)}
              />
            }
          />
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  filter: { padding: Spacing.three },
});
