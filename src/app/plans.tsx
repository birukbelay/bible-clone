/** Reading plans: progress and streak of each plan, and a button to make a new one. */
import { Q } from '@nozbe/watermelondb';
import { router, Stack } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, Row } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { database, type Plan, type PlanReading } from '@/db';
import { useQuery } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { planStats } from '@/plans';

export default function PlansScreen() {
  const theme = useTheme();
  const t = useT();
  const plans = useQuery(
    () => database.get<Plan>('plans').query(Q.sortBy('created_at', Q.desc)),
    [],
    ['name', 'active', 'start_date'],
  );
  const readings = useQuery(() => database.get<PlanReading>('plan_readings').query(), [], ['read_at', 'day']);

  const byPlan = new Map<string, { day: number; readAt: number | null }[]>();
  readings?.forEach((r) => byPlan.set(r.planId, [...(byPlan.get(r.planId) ?? []), { day: r.day, readAt: r.readAt }]));

  const items = plans?.map((p) => ({
    id: p.id,
    name: p.name,
    active: p.active,
    stats: planStats(p.startDate, byPlan.get(p.id) ?? []),
  }));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <IconButton icon={Icons.add} label={t('New plan')} color={theme.tint} onPress={() => router.push('/plan-edit')} />
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          items && readings ? (
            <Empty
              title={t('No reading plans yet')}
              message={t('Make a plan from whole books or chosen chapters, read a few chapters a day and keep your streak.')}>
              <Button title={t('New plan')} icon={Icons.add} onPress={() => router.push('/plan-edit')} />
            </Empty>
          ) : null
        }
        renderItem={({ item }) => {
          const { done, total, streak, today, lastDay } = item.stats;
          const status = !item.active
            ? t('Paused')
            : done === total
              ? t('Finished')
              : today < 0
                ? t('Starts in {count} days', { count: -today })
                : t('Day {day} of {days}', { day: Math.min(today, lastDay) + 1, days: lastDay + 1 });
          return (
            <Row
              left={<Icon name={Icons.plan} color={item.active ? theme.tint : theme.textSecondary} />}
              title={<ThemedText type="smallBold">{item.name}</ThemedText>}
              subtitle={
                <View style={styles.subtitle}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {status} · {t('{done} of {total} read', { done, total })}
                  </ThemedText>
                  <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                    <View style={[styles.bar, { backgroundColor: theme.tint, width: `${total ? (done / total) * 100 : 0}%` }]} />
                  </View>
                </View>
              }
              detail={
                streak ? (
                  <View style={styles.streak}>
                    <Icon name={Icons.flame} size={18} color={theme.tint} />
                    <ThemedText type="smallBold">{streak}</ThemedText>
                  </View>
                ) : undefined
              }
              chevron
              onPress={() => router.push({ pathname: '/plan/[id]', params: { id: item.id } })}
            />
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.five },
  subtitle: { gap: Spacing.one },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
});
