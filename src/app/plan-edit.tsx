/**
 * New reading plan: whole books or chosen chapters, split into days of N chapters,
 * a start day and an optional daily reminder.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { NT_START } from '@/bible/ari';
import { getBooks, useAsync, type Book } from '@/bible/queries';
import { useCurrentVersion } from '@/bible/versions';
import { useDates } from '@/calendar';
import { notify } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { Stepper, TimeStepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Field, Loading, SectionHeader, Segmented, SwitchRow } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createPlan, type PlanChapter } from '@/db/actions';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { addDays, dayName, today } from '@/plans';
import { remindersAvailable, scheduleReminder } from '@/reminders';

const key = (book: number, chapter: number) => `${book}:${chapter}`;

export default function PlanEditScreen() {
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  if (!books) return <Loading />;
  return <PlanForm books={books} />;
}

function PlanForm({ books }: { books: Book[] }) {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'books' | 'chapters'>('books');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<Book | null>(null);
  const [perDay, setPerDay] = useState(3);
  const [start, setStart] = useState(today);
  const [reminder, setReminder] = useState(false);
  const [time, setTime] = useState('07:00');
  const [saving, setSaving] = useState(false);

  const chaptersOf = (b: Book) => Array.from({ length: b.chapters }, (_, i) => i + 1);
  const countIn = (b: Book) => chaptersOf(b).filter((c) => selected.has(key(b.book, c))).length;

  const update = (change: (next: Set<string>) => void) =>
    setSelected((prev) => {
      const next = new Set(prev);
      change(next);
      return next;
    });
  const setBooks = (list: Book[], on: boolean) =>
    update((next) => list.forEach((b) => chaptersOf(b).forEach((c) => (on ? next.add(key(b.book, c)) : next.delete(key(b.book, c))))));
  const toggleBook = (b: Book) => setBooks([b], countIn(b) < b.chapters);
  const toggleChapter = (b: Book, c: number) =>
    update((next) => (next.has(key(b.book, c)) ? next.delete(key(b.book, c)) : next.add(key(b.book, c))));

  // canonical order
  const chapters: PlanChapter[] = books.flatMap((b) =>
    chaptersOf(b)
      .filter((c) => selected.has(key(b.book, c)))
      .map((c) => ({ book: b.book, chapter: c })),
  );
  const days = Math.ceil(chapters.length / perDay);
  const ot = books.filter((b) => b.book < NT_START);
  const nt = books.filter((b) => b.book >= NT_START);
  const all = (list: Book[]) => list.length > 0 && list.every((b) => countIn(b) === b.chapters);

  const create = async () => {
    setSaving(true);
    try {
      const plan = await createPlan({ name, chapters, chaptersPerDay: perDay, startDate: start, reminder: { enabled: reminder, time } }, books);
      if (reminder) {
        const result = await scheduleReminder({ id: plan.id, name: plan.name, time }).catch(() => 'unavailable' as const);
        if (result === 'denied') notify(t('Reminders are off'), t('Allow notifications for this app in the phone settings to get reminders.'));
      }
      router.dismiss();
      router.push({ pathname: '/plan/[id]', params: { id: plan.id } });
    } catch (e) {
      setSaving(false);
      notify(t('Could not create the plan'), t((e as Error).message));
    }
  };

  const bookGrid = (list: Book[]) => (
    <View style={styles.grid}>
      {list.map((b) => {
        const count = countIn(b);
        const whole = count === b.chapters;
        return (
          <Pressable
            key={b.book}
            onPress={() => (mode === 'books' ? toggleBook(b) : setOpen(open?.book === b.book ? null : b))}
            style={({ pressed }) => [
              styles.bookCell,
              {
                backgroundColor: whole ? theme.tint : count ? theme.tintSoft : theme.backgroundElement,
                borderColor: open?.book === b.book ? theme.tint : 'transparent',
              },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" numberOfLines={1} style={whole && styles.onTint}>
              {b.name}
            </ThemedText>
            {count > 0 && !whole ? (
              <ThemedText type="small" themeColor="tint" style={styles.count}>
                {count}/{b.chapters}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const chapterGrid = (b: Book) => (
    <View style={[styles.chapters, { borderColor: theme.border }]}>
      <View style={styles.chaptersHead}>
        <ThemedText type="smallBold" style={styles.flex}>
          {b.name}
        </ThemedText>
        <Chip label={t('All')} onPress={() => setBooks([b], true)} />
        <Chip label={t('None')} onPress={() => setBooks([b], false)} />
      </View>
      <View style={styles.grid}>
        {chaptersOf(b).map((c) => {
          const on = selected.has(key(b.book, c));
          return (
            <Pressable
              key={c}
              onPress={() => toggleChapter(b, c)}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.cell, { backgroundColor: on ? theme.tint : theme.backgroundElement }, pressed && styles.pressed]}>
              <ThemedText type="smallBold" style={on && styles.onTint}>
                {c}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const section = (title: string, list: Book[]) => (
    <>
      <View style={styles.sectionRow}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
          {title.toUpperCase()}
        </ThemedText>
        <Chip label={all(list) ? t('Clear') : t('All')} onPress={() => setBooks(list, !all(list))} />
      </View>
      {bookGrid(list)}
      {mode === 'chapters' && open && list.some((b) => b.book === open.book) ? chapterGrid(open) : null}
    </>
  );

  const end = addDays(start, Math.max(0, days - 1));

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Field value={name} onChangeText={setName} placeholder={t('Plan name, e.g. Gospels in a month')} autoFocus />

      <SectionHeader title={t('What to read')} />
      <Segmented
        options={[
          { value: 'books', label: t('Whole books') },
          { value: 'chapters', label: t('Pick chapters') },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setOpen(null);
        }}
      />
      <ThemedText type="small" themeColor="textSecondary">
        {mode === 'books' ? t('Tap books to add or remove them.') : t('Tap a book, then tap its chapters.')}
      </ThemedText>
      {section(t('Old Testament'), ot)}
      {section(t('New Testament'), nt)}

      <SectionHeader title={t('Chapters per day')} />
      <Stepper
        value={String(perDay)}
        label={t('per day')}
        onMinus={() => setPerDay(perDay - 1)}
        onPlus={() => setPerDay(perDay + 1)}
        minusDisabled={perDay <= 1}
        plusDisabled={perDay >= 50}
        minusLabel={t('Fewer')}
        plusLabel={t('More')}
      />

      <SectionHeader title={t('Start')} />
      <Stepper
        value={dayName(t, start, dates)}
        onMinus={() => setStart(addDays(start, -1))}
        onPlus={() => setStart(addDays(start, 1))}
        minusLabel={t('Earlier')}
        plusLabel={t('Later')}
      />

      <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">
          {chapters.length
            ? t('{chapters} chapters in {days} days', { chapters: chapters.length, days })
            : t('No chapters selected')}
        </ThemedText>
        {chapters.length ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('Last day: {date}', { date: dates.format(end, { day: true, month: 'long', year: true }) })}
          </ThemedText>
        ) : null}
      </View>

      <SectionHeader title={t('Reminder')} />
      <SwitchRow
        title={t('Remind me every day')}
        subtitle={remindersAvailable() ? undefined : t("This build can't show notifications; today's reading is shown in the reader instead.")}
        value={reminder}
        onChange={setReminder}
      />
      {reminder ? (
        <TimeStepper value={time} onChange={setTime} labels={{ hour: t('hour'), minute: t('minute'), earlier: t('Earlier'), later: t('Later') }} />
      ) : null}

      <Button
        title={saving ? t('Creating…') : t('Create plan')}
        icon={Icons.check}
        disabled={saving || !name.trim() || !chapters.length}
        onPress={create}
        style={styles.create}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  flex: { flex: 1 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  bookCell: {
    width: '31.5%',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 2,
  },
  count: { fontSize: 12, lineHeight: 16 },
  chapters: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.two, gap: Spacing.two },
  chaptersHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cell: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  onTint: { color: '#ffffff' },
  summary: { borderRadius: 12, padding: Spacing.three, gap: Spacing.half, marginTop: Spacing.two },
  create: { marginTop: Spacing.three },
});
