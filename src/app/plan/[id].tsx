/**
 * One reading plan: streak, days since the start, progress, and the readings grouped by day as a
 * to-do list. Tap the circle to mark a reading read today, long-press it to change the day it was read.
 */
import { Q } from '@nozbe/watermelondb';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';

import { openInReader } from '@/bible/reference';
import { useDates, type Dates } from '@/calendar';
import { confirm, showError } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { MenuItem, Popover } from '@/components/popover';
import { TimeStepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, Loading, longPress, SectionHeader, Segmented, SwitchRow, type Interaction } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { database, type Plan, type PlanReading } from '@/db';
import { deletePlan, setRead, setReadAll, setReadOn, startOfDay, updatePlan } from '@/db/actions';
import { useQuery, useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { addDays, dateOfDay, dayName, planStats, today as todayStart } from '@/plans';
import { cancelReminder, remindersAvailable, scheduleReminder } from '@/reminders';
import { settings, useSetting } from '@/settings';

type Item = { id: string; label: string; ari: number; day: number; readAt: number | null; record: PlanReading };

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const plan = useRecord(
    () => database.get<Plan>('plans').find(id),
    (p) => ({
      name: p.name,
      startDate: p.startDate,
      active: p.active,
      reminderEnabled: p.reminderEnabled,
      reminderTime: p.reminderTime,
    }),
    [id],
  );
  const readings = useQuery(
    () => database.get<PlanReading>('plan_readings').query(Q.where('plan_id', id), Q.sortBy('position', Q.asc)),
    [id],
    ['read_at', 'day', 'label'],
  );
  if (plan === undefined || !readings) return <Loading />;
  if (!plan) return <Empty title={t('This plan was deleted')} />;
  const items: Item[] = readings.map((r) => ({ id: r.id, label: r.label, ari: r.ari, day: r.day, readAt: r.readAt, record: r }));
  return <PlanView plan={plan} items={items} />;
}

function PlanView({
  plan,
  items,
}: {
  plan: { name: string; startDate: number; active: boolean; reminderEnabled: boolean; reminderTime: string; record: Plan };
  items: Item[];
}) {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const [calendar, setCalendar] = useSetting(settings.calendar);
  const [editing, setEditing] = useState<Item | null>(null);
  const [showDone, setShowDone] = useState(false);
  const stats = planStats(plan.startDate, items);
  const fail = showError(t('Could not save'));

  const days = new Map<number, Item[]>();
  items.forEach((i) => days.set(i.day, [...(days.get(i.day) ?? []), i]));
  const allSections = [...days.entries()].map(([day, data]) => ({ day, data, done: data.every((i) => i.readAt != null) }));
  // finished days before today are folded away unless asked for
  const hidden = allSections.filter((s) => s.done && s.day < stats.today).length;
  const visible = showDone ? allSections : allSections.filter((s) => !(s.done && s.day < stats.today));
  // a divider above the first day of each month, with that month's progress
  const months = new Map<number, { done: number; total: number }>();
  allSections.forEach((s) => {
    const m = dates.monthKey(dateOfDay(plan.startDate, s.day));
    const count = months.get(m) ?? { done: 0, total: 0 };
    s.data.forEach((i) => {
      count.total++;
      if (i.readAt != null) count.done++;
    });
    months.set(m, count);
  });
  const sections = visible.map((s, n) => {
    const date = dateOfDay(plan.startDate, s.day);
    const month = dates.monthKey(date);
    const first = n === 0 || dates.monthKey(dateOfDay(plan.startDate, visible[n - 1].day)) !== month;
    return { ...s, date, month: first ? { label: dates.format(date, { month: 'long', year: true }), ...months.get(month)! } : null };
  });

  const toggle = (item: Item) => setRead(item.record, item.readAt == null).catch(fail);

  /** Saves the switches and keeps the scheduled reminder in step with them. */
  const change = async (patch: { reminderEnabled?: boolean; reminderTime?: string; active?: boolean }) => {
    await updatePlan(plan.record, patch).catch(fail);
    const next = { active: plan.active, reminderEnabled: plan.reminderEnabled, reminderTime: plan.reminderTime, ...patch };
    if (next.active && next.reminderEnabled) {
      scheduleReminder({ id: plan.record.id, name: plan.name, time: next.reminderTime }).catch(fail);
    } else {
      cancelReminder(plan.record.id);
    }
  };

  const remove = () =>
    confirm({
      title: t('Delete “{name}”?', { name: plan.name }),
      message: t('The plan and its progress are deleted.'),
      confirmText: t('Delete'),
      destructive: true,
    }).then((ok) => {
      if (!ok) return;
      cancelReminder(plan.record.id);
      deletePlan(plan.record).then(() => router.back(), fail);
    });

  const records = items.map((i) => i.record);
  const reset = () =>
    confirm({ title: t('Reset progress?'), message: t('Every reading is marked not read.'), confirmText: t('Reset'), destructive: true }).then((ok) => {
      if (ok) setReadAll(records, false).catch(fail);
    });

  const sinceStart = stats.today;
  const header = (
    <View style={styles.header}>
      <View style={styles.stats}>
        <Stat icon={<Icon name={Icons.flame} size={26} color={stats.streak ? theme.tint : theme.textSecondary} />} value={stats.streak} label={t('day streak')} />
        <Stat
          value={sinceStart >= 0 ? sinceStart + 1 : -sinceStart}
          label={sinceStart >= 0 ? t('days since start') : t('days to start')}
        />
        <Stat value={`${stats.done}/${stats.total}`} label={t('read')} />
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.bar, { backgroundColor: theme.tint, width: `${stats.total ? (stats.done / stats.total) * 100 : 0}%` }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Started {date}', { date: dates.format(plan.startDate, { day: true, month: 'long', year: true }) })}
        {' · '}
        {t('ends {date}', { date: dates.format(dateOfDay(plan.startDate, stats.lastDay), { day: true, month: 'long' }) })}
      </ThemedText>
      {stats.behind > 0 ? (
        <ThemedText type="smallBold" style={{ color: theme.danger }}>
          {t('{count} readings behind', { count: stats.behind })}
        </ThemedText>
      ) : stats.done === stats.total && stats.total > 0 ? (
        <ThemedText type="smallBold" themeColor="tint">
          {t('Plan finished!')}
        </ThemedText>
      ) : null}
      {hidden > 0 || showDone ? (
        <Button
          kind="plain"
          title={showDone ? t('Hide finished days') : t('Show {count} finished days', { count: hidden })}
          onPress={() => setShowDone(!showDone)}
        />
      ) : null}
    </View>
  );

  const footer = (
    <View>
      <SectionHeader title={t('Plan settings')} />
      <SwitchRow
        title={t('Active')}
        subtitle={t("Active plans show today's reading in the reader.")}
        value={plan.active}
        onChange={(active) => change({ active })}
      />
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Calendar')}
        </ThemedText>
        <Segmented
          options={[
            { value: 'auto', label: t('Automatic') },
            { value: 'gregorian', label: t('Gregorian') },
            { value: 'ethiopian', label: t('Ethiopian') },
          ]}
          value={calendar}
          onChange={setCalendar}
        />
      </View>
      <SwitchRow
        title={t('Daily reminder')}
        subtitle={remindersAvailable() ? undefined : t("This build can't show notifications; today's reading is shown in the reader instead.")}
        value={plan.reminderEnabled}
        onChange={(reminderEnabled) => change({ reminderEnabled })}
      />
      {plan.reminderEnabled ? (
        <View style={styles.block}>
          <TimeStepper
            value={plan.reminderTime}
            onChange={(reminderTime) => change({ reminderTime })}
            labels={{ hour: t('hour'), minute: t('minute'), earlier: t('Earlier'), later: t('Later') }}
          />
        </View>
      ) : null}
      <View style={styles.block}>
        <Button kind="plain" icon={Icons.check} title={t('Mark all read')} onPress={() => setReadAll(records, true).catch(fail)} />
        <Button kind="plain" title={t('Reset progress')} onPress={reset} />
        <Button kind="danger" icon={Icons.trash} title={t('Delete plan')} onPress={remove} />
      </View>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: plan.name }} />
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderSectionHeader={({ section }) => {
          const today = section.day === stats.today;
          return (
            <>
              {section.month ? (
                <View style={[styles.month, { borderBottomColor: theme.tint }]}>
                  <ThemedText type="subtitle" style={[styles.flex, styles.monthName]}>
                    {section.month.label}
                  </ThemedText>
                  <ThemedText type="small" themeColor={section.month.done === section.month.total ? 'tint' : 'textSecondary'}>
                    {t('{done} of {total} read', { done: section.month.done, total: section.month.total })}
                  </ThemedText>
                </View>
              ) : null}
              <View style={[styles.dayHeader, today && { backgroundColor: theme.tintSoft }]}>
                <ThemedText type="smallBold" themeColor={today ? 'tint' : 'text'} style={styles.flex}>
                  {t('Day {day}', { day: section.day + 1 })}
                </ThemedText>
                <ThemedText type="small" themeColor={!section.done && section.day < stats.today ? 'danger' : 'textSecondary'}>
                  {dayName(t, section.date, dates)}
                </ThemedText>
              </View>
            </>
          );
        }}
        renderItem={({ item }) => (
          <ReadingRow
            label={item.label}
            readAt={item.readAt}
            dueOn={dateOfDay(plan.startDate, item.day)}
            dates={dates}
            onToggle={() => toggle(item)}
            onEdit={() => setEditing(item)}
            onOpen={() => openInReader(item.ari)}
          />
        )}
      />
      <Popover visible={!!editing} onClose={() => setEditing(null)} style={styles.popover}>
        {editing ? <ReadOnMenu item={editing} start={plan.startDate} onDone={() => setEditing(null)} /> : null}
      </Popover>
    </>
  );
}

function Stat({ value, label, icon }: { value: number | string; label: string; icon?: ReactNode }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValue}>
        {icon}
        <ThemedText type="subtitle">{value}</ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {label}
      </ThemedText>
    </View>
  );
}

function ReadingRow({
  label,
  readAt,
  dueOn,
  dates,
  onToggle,
  onEdit,
  onOpen,
}: {
  label: string;
  readAt: number | null;
  dueOn: number;
  dates: Dates;
  onToggle: () => void;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const read = readAt != null;
  const offDay = read && startOfDay(readAt) !== dueOn;
  return (
    <View style={[styles.reading, { borderBottomColor: theme.border }]}>
      <Pressable
        onPress={onToggle}
        {...longPress(onEdit)}
        hitSlop={8}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: read }}
        accessibilityLabel={label}
        style={({ pressed }: Interaction) => pressed && styles.pressed}>
        <Icon name={read ? Icons.checkCircle : Icons.circle} size={26} color={read ? theme.tint : theme.textSecondary} />
      </Pressable>
      <Pressable onPress={onOpen} {...longPress(onEdit)} style={({ pressed, hovered }: Interaction) => [styles.flex, (pressed || hovered) && styles.pressed]}>
        <ThemedText style={read && { color: theme.textSecondary, textDecorationLine: 'line-through' }}>{label}</ThemedText>
        {read ? (
          <ThemedText type="small" themeColor={offDay ? 'tint' : 'textSecondary'}>
            {t('Read {day}', { day: dayName(t, readAt, dates) })}
          </ThemedText>
        ) : null}
      </Pressable>
      <IconButton icon={Icons.moreVertical} label={t('Change read day')} color={theme.textSecondary} onPress={onEdit} />
    </View>
  );
}

/** Change the day a reading was read on. */
function ReadOnMenu({ item, start, onDone }: { item: Item; start: number; onDone: () => void }) {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const [today] = useState(todayStart);
  const [day, setDay] = useState(() => (item.readAt == null ? today : startOfDay(item.readAt)));
  /** `on`: midnight of the day it was read, or null for not read. */
  const save = (on: number | null) => {
    const fail = showError(t('Could not save'));
    if (on === today) setRead(item.record, true).catch(fail);
    else setReadOn(item.record, on == null ? null : on + 12 * 60 * 60 * 1000).catch(fail);
    onDone();
  };
  return (
    <>
      <View style={styles.menuHead}>
        <ThemedText type="smallBold">{item.label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Planned for {day}', { day: dayName(t, dateOfDay(start, item.day), dates) })}
        </ThemedText>
      </View>
      <View style={styles.menuDay}>
        <IconButton icon={Icons.left} label={t('Earlier')} color={theme.tint} onPress={() => setDay(addDays(day, -1))} />
        <ThemedText type="smallBold" style={[styles.flex, styles.center]}>
          {dayName(t, day, dates)}
        </ThemedText>
        <IconButton icon={Icons.right} label={t('Later')} color={theme.tint} disabled={day >= today} onPress={() => setDay(addDays(day, 1))} />
      </View>
      <MenuItem icon={Icons.checkCircle} label={t('Read on this day')} onPress={() => save(day)} />
      {dateOfDay(start, item.day) <= today ? (
        <MenuItem icon={Icons.plan} label={t('Read on the planned day')} onPress={() => save(dateOfDay(start, item.day))} />
      ) : null}
      {item.readAt != null ? <MenuItem icon={Icons.circle} label={t('Not read')} onPress={() => save(null)} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.five },
  header: { padding: Spacing.three, gap: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.two },
  stat: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statValue: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  month: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.four,
    paddingBottom: Spacing.one,
    borderBottomWidth: 2,
  },
  monthName: { fontSize: 20, lineHeight: 26 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  pressed: { opacity: 0.6 },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  popover: { top: '25%', alignSelf: 'center', width: 300 },
  menuHead: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.half },
  menuDay: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.two },
});
