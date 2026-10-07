/**
 * Reading progress, kept on the device: share of the Bible read, the reading streak, a calendar
 * of the last weeks and each book's chapters. A chapter counts as read after it stays open in
 * the reader for a few seconds.
 */
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BOOK_COUNT, makeAri, NT_START } from '@/bible/ari';
import { getBooks, useAsync } from '@/bible/queries';
import { bookProgress, dayKey, longestStreak, readingStreak } from '@/bible/reading';
import { openInReader } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { confirm } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { IconButton, SectionHeader, type Interaction } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

const WEEKS = 16;
const CELL = 14;

export default function ProgressScreen() {
  const theme = useTheme();
  const t = useT();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [chapters] = useSetting(settings.readChapters);
  const [days] = useSetting(settings.readDays);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);

  const perBook = bookProgress(chapters);
  const read = perBook.reduce((s, b) => s + b.read, 0);
  const total = perBook.reduce((s, b) => s + b.total, 0);
  const percent = total ? (read / total) * 100 : 0;
  const streak = readingStreak(days);
  const best = longestStreak(days);
  const daysRead = Object.values(days).filter((n) => n > 0).length;
  const nameOf = (book: number) => books?.find((b) => b.book === book)?.name ?? String(book + 1);

  const reset = () =>
    confirm({ title: t('Reset reading progress?'), message: t('Read chapters and the reading calendar are cleared.'), confirmText: t('Reset'), destructive: true }).then(
      (ok) => {
        if (!ok) return;
        settings.readChapters.set({});
        settings.readDays.set({});
      },
    );

  const section = (from: number, to: number) => {
    const list = perBook.slice(from, to);
    const r = list.reduce((s, b) => s + b.read, 0);
    const n = list.reduce((s, b) => s + b.total, 0);
    return { read: r, total: n };
  };
  const ot = section(0, NT_START);
  const nt = section(NT_START, BOOK_COUNT);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon={Icons.restore} label={t('Reset reading progress')} color={theme.textSecondary} onPress={reset} />,
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.summary}>
          <Stat value={`${percent < 10 && percent > 0 ? percent.toFixed(1) : Math.round(percent)}%`} label={t('of the Bible read')} />
          <Stat value={String(streak)} label={t('day streak')} icon={streak > 0} />
          <Stat value={String(best)} label={t('longest streak')} />
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {t('{read} of {total} chapters · {days} days with reading', { read, total, days: daysRead })}
        </ThemedText>
        <Bar label={t('Old Testament')} read={ot.read} total={ot.total} />
        <Bar label={t('New Testament')} read={nt.read} total={nt.total} />

        <SectionHeader title={t('Last {weeks} weeks', { weeks: WEEKS })} />
        <Heatmap days={days} />

        <SectionHeader title={t('Books')} />
        <View style={styles.books}>
          {perBook.map((b) => (
            <Pressable
              key={b.book}
              onPress={() => openInReader(makeAri(b.book, 1, 1))}
              accessibilityRole="button"
              accessibilityLabel={t('{book}: {read} of {total} chapters', { book: nameOf(b.book), read: b.read, total: b.total })}
              style={({ pressed, hovered }: Interaction) => [styles.book, (pressed || hovered) && { backgroundColor: theme.backgroundElement }]}>
              <View style={styles.bookHeader}>
                <ThemedText type="small" numberOfLines={1} style={styles.fill}>
                  {nameOf(b.book)}
                </ThemedText>
                {b.read === b.total ? (
                  <Icon name={Icons.checkCircle} size={14} color={theme.tint} />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    {b.read}/{b.total}
                  </ThemedText>
                )}
              </View>
              <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.trackFill, { backgroundColor: theme.tint, width: `${(b.read / b.total) * 100}%` }]} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.statValue}>
        {icon && <Icon name={Icons.flame} size={20} color={theme.tint} />}
        <ThemedText type="subtitle">{value}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
    </View>
  );
}

function Bar({ label, read, total }: { label: string; read: number; total: number }) {
  const theme = useTheme();
  return (
    <View style={styles.bar}>
      <View style={styles.bookHeader}>
        <ThemedText type="smallBold" style={styles.fill}>
          {label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {read}/{total}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.trackFill, { backgroundColor: theme.tint, width: `${total ? (read / total) * 100 : 0}%` }]} />
      </View>
    </View>
  );
}

/** Columns of weeks (Sunday at the top), today in the last column; darker = more chapters. */
function Heatmap({ days }: { days: Record<string, number> }) {
  const theme = useTheme();
  const t = useT();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - today.getDay() - (WEEKS - 1) * 7);
  const weeks: { key: string; count: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const key = dayKey(date.getTime());
      week.push({ key, count: days[key] ?? 0, future: date.getTime() > today.getTime() });
    }
    weeks.push(week);
  }
  const shade = (count: number) => (count >= 4 ? 1 : count >= 2 ? 0.7 : count >= 1 ? 0.4 : 0);
  return (
    <View style={styles.heatmap} accessibilityLabel={t('Reading calendar')}>
      {weeks.map((week, i) => (
        <View key={i} style={styles.week}>
          {week.map((day) => (
            <View key={day.key} style={[styles.cell, { backgroundColor: day.future ? 'transparent' : theme.backgroundElement }]}>
              {day.count > 0 && <View style={[styles.cellFill, { backgroundColor: theme.tint, opacity: shade(day.count) }]} />}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  summary: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', padding: Spacing.three, borderRadius: 14, gap: Spacing.one },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  center: { textAlign: 'center' },
  fill: { flex: 1 },
  bar: { gap: Spacing.one, paddingVertical: Spacing.one },
  heatmap: { flexDirection: 'row', gap: 3, alignSelf: 'center' },
  week: { gap: 3 },
  cell: { width: CELL, height: CELL, borderRadius: 3, overflow: 'hidden' },
  cellFill: { flex: 1 },
  books: { flexDirection: 'row', flexWrap: 'wrap' },
  book: { width: '50%', padding: Spacing.two, gap: Spacing.one, borderRadius: 10 },
  bookHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
});
