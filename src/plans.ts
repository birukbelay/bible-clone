/** Reading plan helpers: days, streaks, what is due. Writes are in src/db/actions.ts. */
import { Q } from '@nozbe/watermelondb';

import type { Dates } from '@/calendar';
import { database, type Plan, type PlanReading } from '@/db';
import { startOfDay } from '@/db/actions';
import { useQuery } from '@/db/hooks';
import type { T } from '@/i18n';

const DAY = 24 * 60 * 60 * 1000;

/** Day number of `time` in a plan that starts on `start` (0 = first day; negative = not started). */
export function dayIndex(start: number, time = Date.now()) {
  // rounded: a day is 23 or 25 hours when the clocks change
  return Math.round((startOfDay(time) - startOfDay(start)) / DAY);
}

/** Midnight of a plan's day `day`. */
export function dateOfDay(start: number, day: number) {
  const d = new Date(start);
  d.setDate(d.getDate() + day);
  return startOfDay(d.getTime());
}

export function addDays(time: number, days: number) {
  return dateOfDay(time, days);
}

/** Midnight today. */
export function today() {
  return startOfDay(Date.now());
}

/** "Today", "Tomorrow", "Yesterday" or the date. */
export function dayName(t: T, time: number, dates: Dates) {
  const d = dayIndex(Date.now(), time);
  if (d === 0) return t('Today');
  if (d === 1) return t('Tomorrow');
  if (d === -1) return t('Yesterday');
  return dates.format(time, { weekday: true, day: true, month: 'short' });
}

/** Days in a row with some reading done, ending today (or yesterday, when today is still open). */
export function streak(readAts: (number | null)[], now = Date.now()) {
  const days = new Set(readAts.filter((t): t is number => t != null).map(startOfDay));
  let day = startOfDay(now);
  if (!days.has(day)) day = addDays(day, -1);
  let count = 0;
  while (days.has(day)) {
    count++;
    day = addDays(day, -1);
  }
  return count;
}

export type PlanStats = {
  total: number;
  done: number;
  /** today's day number (can be past the last day, or negative before the start) */
  today: number;
  /** last day of the plan */
  lastDay: number;
  streak: number;
  /** unread readings scheduled before today */
  behind: number;
};

export function planStats(start: number, readings: { day: number; readAt: number | null }[], now = Date.now()): PlanStats {
  const today = dayIndex(start, now);
  return {
    total: readings.length,
    done: readings.filter((r) => r.readAt != null).length,
    today,
    lastDay: readings.reduce((max, r) => Math.max(max, r.day), 0),
    streak: streak(
      readings.map((r) => r.readAt),
      now,
    ),
    behind: readings.filter((r) => r.readAt == null && r.day < today).length,
  };
}

export type DueReading = { id: string; planId: string; planName: string; label: string; ari: number; late: boolean; record: PlanReading };

/** Unread readings of active plans that are due today or earlier, first plan first. */
export function useDueReadings() {
  const plans = useQuery(() => database.get<Plan>('plans').query(Q.where('active', true)), [], ['active', 'start_date', 'name']);
  const ids = plans?.map((p) => p.id) ?? [];
  const key = ids.join(',');
  const readings = useQuery(
    () =>
      database
        .get<PlanReading>('plan_readings')
        .query(Q.where('plan_id', Q.oneOf(key ? key.split(',') : [])), Q.where('read_at', null), Q.sortBy('position', Q.asc)),
    [key],
    ['read_at', 'day'],
  );
  if (!plans || !readings) return undefined;
  const due: DueReading[] = [];
  for (const plan of plans) {
    const today = dayIndex(plan.startDate);
    for (const r of readings) {
      if (r.planId !== plan.id || r.readAt != null || r.day > today) continue;
      due.push({ id: r.id, planId: plan.id, planName: plan.name, label: r.label, ari: r.ari, late: r.day < today, record: r });
    }
  }
  return due;
}
