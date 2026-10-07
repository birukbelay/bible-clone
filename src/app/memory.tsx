/**
 * Memory verses: the list with the next review of each, and a review that shows the reference,
 * then (after a try) the verse. Remembered verses come back after longer and longer breaks
 * (MEMORY_INTERVALS), forgotten ones tomorrow. Optional daily reminder.
 */
import { Q } from '@nozbe/watermelondb';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { getBooks, getRange, useAsync } from '@/bible/queries';
import { formatRef, openInReader } from '@/bible/reference';
import { plainText } from '@/bible/markup';
import { useCurrentVersion } from '@/bible/versions';
import { useDates } from '@/calendar';
import { confirm, notify, showError } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { TimeStepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, longPress, Row, SectionHeader, type Interaction } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { database, type MemoryVerse } from '@/db';
import { deleteMemoryVerse, MEMORY_INTERVALS, reviewMemoryVerse, startOfDay } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { dayName } from '@/plans';
import { cancelNotification, remindersAvailable, scheduleDaily } from '@/reminders';
import { settings, useSetting } from '@/settings';

const REMINDER_ID = 'memory-verses';

type Item = { id: string; ari: number; ariEnd: number; versionId: string | null; level: number; nextDue: number; record: MemoryVerse };

export default function MemoryScreen() {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [reviewing, setReviewing] = useState<Item[] | null>(null);
  const [today] = useState(() => startOfDay(Date.now()));
  const records = useQuery(
    () => database.get<MemoryVerse>('memory_verses').query(Q.sortBy('next_due', Q.asc)),
    [],
    ['level', 'next_due'],
  );
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const items: Item[] | undefined = records?.map((r) => ({
    id: r.id,
    ari: r.ari,
    ariEnd: r.ariEnd,
    versionId: r.versionId,
    level: r.level,
    nextDue: r.nextDue,
    record: r,
  }));
  const due = items?.filter((i) => i.nextDue <= today) ?? [];

  if (reviewing) {
    return <Review items={reviewing} fallbackVersion={versionId} onDone={() => setReviewing(null)} />;
  }

  const remove = (item: Item) =>
    confirm({ title: t('Remove {ref} from memory verses?', { ref: formatRef(books, item.ari, item.ariEnd) }), confirmText: t('Remove'), destructive: true }).then(
      (ok) => {
        if (ok) deleteMemoryVerse(item.record).catch(showError(t('Could not delete')));
      },
    );

  return (
    <>
      <Stack.Screen options={{ title: t('Memory verses') }} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          items?.length ? (
            <View style={styles.header}>
              <ThemedText type="small" themeColor="textSecondary">
                {due.length ? t('{count} verses to review today', { count: due.length }) : t('Nothing to review today. Well done!')}
              </ThemedText>
              <Button
                title={due.length ? t('Review') : t('Review all anyway')}
                icon={Icons.memory}
                kind={due.length ? 'primary' : 'plain'}
                onPress={() => setReviewing(due.length ? due : items)}
              />
              <ReminderSettings />
              <SectionHeader title={t('Verses')} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          items ? (
            <Empty
              title={t('No memory verses yet')}
              message={t('Select verses in the reader and tap Memorize. They come back for review after 1, 2, 4, 7 days and longer as you learn them.')}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <Row
            left={<Level level={item.level} />}
            title={formatRef(books, item.ari, item.ariEnd)}
            subtitle={item.nextDue <= today ? t('Due today') : t('Next review: {day}', { day: dayName(t, item.nextDue, dates) })}
            onPress={() => openInReader(item.ari)}
            onLongPress={() => remove(item)}
            right={<IconButton icon={Icons.trash} label={t('Remove')} size={18} color={theme.textSecondary} onPress={() => remove(item)} />}
          />
        )}
      />
    </>
  );
}

/** Box of the verse as filled dots. */
function Level({ level }: { level: number }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.level} accessibilityLabel={t('Level {level} of {max}', { level, max: MEMORY_INTERVALS.length })}>
      {MEMORY_INTERVALS.map((_, i) => (
        <View key={i} style={[styles.levelDot, { backgroundColor: i < level ? theme.tint : theme.backgroundSelected }]} />
      ))}
    </View>
  );
}

function ReminderSettings() {
  const t = useT();
  const [reminder, setReminder] = useSetting(settings.memoryReminder);
  if (!remindersAvailable()) return null;
  const apply = (next: { enabled: boolean; time: string }) => {
    setReminder(next);
    if (!next.enabled) {
      void cancelNotification(REMINDER_ID);
      return;
    }
    scheduleDaily(REMINDER_ID, t('Memory verses'), t('Time to review your memory verses'), next.time).then((result) => {
      if (result === 'denied') {
        setReminder({ ...next, enabled: false });
        notify(t('Notifications are off'), t('Allow notifications for this app in the phone settings.'));
      }
    }, showError(t('Could not set the reminder')));
  };
  return (
    <View style={styles.reminder}>
      <View style={styles.reminderRow}>
        <Icon name={Icons.bell} size={18} />
        <ThemedText style={styles.fill}>{t('Daily reminder')}</ThemedText>
        <Switch value={reminder.enabled} onValueChange={(enabled) => apply({ ...reminder, enabled })} accessibilityLabel={t('Daily reminder')} />
      </View>
      {reminder.enabled && (
        <TimeStepper
          value={reminder.time}
          onChange={(time) => apply({ ...reminder, time })}
          labels={{ hour: t('hour'), minute: t('minute'), earlier: t('Earlier'), later: t('Later') }}
        />
      )}
    </View>
  );
}

/** First letter of every word, the rest hidden: "F G s l t w" */
const firstLetters = (text: string) =>
  text
    .split(/\s+/)
    .map((w) => {
      const chars = Array.from(w);
      const first = chars.findIndex((c) => /\p{L}/u.test(c));
      return first < 0 ? w : chars.slice(0, first + 1).join('') + chars.slice(first + 1).map((c) => (/\p{L}/u.test(c) ? '_' : c)).join('');
    })
    .join(' ');

function Review({ items, fallbackVersion, onDone }: { items: Item[]; fallbackVersion: string; onDone: () => void }) {
  const theme = useTheme();
  const t = useT();
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<'reference' | 'hint' | 'verse'>('reference');
  const [score, setScore] = useState({ remembered: 0, forgot: 0 });
  const [fontSize] = useSetting(settings.fontSize);
  const item = items[index];
  const versionId = item?.versionId || fallbackVersion;
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { data: verses } = useAsync(() => (item ? getRange(versionId, item.ari, item.ariEnd) : Promise.resolve([])), [versionId, item?.id]);

  if (!item) {
    return (
      <>
        <Stack.Screen options={{ title: t('Review') }} />
        <Empty
          title={t('Review finished')}
          message={t('{remembered} remembered, {forgot} to practice again', { remembered: score.remembered, forgot: score.forgot })}>
          <Button title={t('Done')} icon={Icons.check} onPress={onDone} />
        </Empty>
      </>
    );
  }

  const answer = (remembered: boolean) => {
    reviewMemoryVerse(item.record, remembered).catch(showError(t('Could not save')));
    setScore({ remembered: score.remembered + (remembered ? 1 : 0), forgot: score.forgot + (remembered ? 0 : 1) });
    setStage('reference');
    setIndex(index + 1);
  };
  const text = verses?.map((v) => plainText(v.text).trim()).join(' ') ?? '';

  return (
    <>
      <Stack.Screen
        options={{
          title: t('{n} of {total}', { n: index + 1, total: items.length }),
          headerRight: () => <IconButton icon={Icons.close} label={t('End review')} color={theme.tint} onPress={onDone} />,
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.review}>
        <ThemedText type="subtitle" style={styles.center}>
          {formatRef(books, item.ari, item.ariEnd)}
        </ThemedText>
        <Pressable
          onPress={() => setStage(stage === 'reference' ? 'hint' : 'verse')}
          {...longPress(() => setStage('verse'))}
          accessibilityRole="button"
          accessibilityLabel={stage === 'verse' ? text : stage === 'hint' ? t('Show the verse') : t('Show a hint')}
          style={({ pressed, hovered }: Interaction) => [
            styles.card,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            (pressed || hovered) && { opacity: 0.85 },
          ]}>
          {stage === 'verse' ? (
            verses?.map((v) => <VerseText key={v.ari} text={v.text} label={verses.length > 1 ? v.label : undefined} fontSize={fontSize} />)
          ) : stage === 'hint' ? (
            <ThemedText style={[styles.hint, { fontSize, lineHeight: fontSize * 1.6 }]}>{firstLetters(text)}</ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary" style={styles.center}>
              {t('Say the verse, then tap for a hint. Tap again to see it.')}
            </ThemedText>
          )}
        </Pressable>
        {stage === 'verse' ? (
          <View style={styles.answers}>
            <Button title={t('Forgot')} kind="plain" onPress={() => answer(false)} style={styles.fill} />
            <Button title={t('Remembered')} icon={Icons.check} onPress={() => answer(true)} style={styles.fill} />
          </View>
        ) : (
          <Button title={stage === 'hint' ? t('Show the verse') : t('Show a hint')} kind="plain" onPress={() => setStage(stage === 'reference' ? 'hint' : 'verse')} />
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  header: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
  reminder: { gap: Spacing.two },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fill: { flex: 1 },
  level: { flexDirection: 'row', gap: 2, width: 40, flexWrap: 'wrap' },
  levelDot: { width: 8, height: 8, borderRadius: 4 },
  review: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.four, gap: Spacing.four },
  center: { textAlign: 'center' },
  card: { minHeight: 200, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.four, justifyContent: 'center', gap: Spacing.two },
  hint: { letterSpacing: 1 },
  answers: { flexDirection: 'row', gap: Spacing.three },
});
