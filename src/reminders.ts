/**
 * Daily reading-plan reminders as local notifications (scheduled on the phone itself; no push
 * service or account). expo-notifications is optional: when it is not installed in the build,
 * reminders report themselves unavailable and the reader shows today's reading instead.
 *
 * To enable: bunx expo install expo-notifications, then rebuild the app.
 */
import { Platform } from 'react-native';

import { t } from '@/i18n';

/** The part of expo-notifications used here (typed locally: the package may be missing). */
type Notifications = {
  setNotificationHandler(handler: {
    handleNotification: () => Promise<{ shouldShowBanner: boolean; shouldShowList: boolean; shouldPlaySound: boolean; shouldSetBadge: boolean }>;
  }): void;
  setNotificationChannelAsync(id: string, channel: { name: string; importance: number }): Promise<unknown>;
  AndroidImportance: { HIGH: number };
  SchedulableTriggerInputTypes: { DAILY: string };
  getPermissionsAsync(): Promise<{ granted: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  scheduleNotificationAsync(request: {
    identifier: string;
    content: { title: string; body: string };
    trigger: { type: string; hour: number; minute: number; channelId?: string };
  }): Promise<string>;
  cancelScheduledNotificationAsync(id: string): Promise<void>;
  getAllScheduledNotificationsAsync(): Promise<{ identifier: string }[]>;
};

let loaded: Notifications | null | undefined;

function notifications(): Notifications | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === 'web') return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    loaded = require('expo-notifications') as Notifications;
  } catch {
    loaded = null;
  }
  return loaded;
}

const CHANNEL = 'reminders';
const id = (planId: string) => `plan-${planId}`;

export const remindersAvailable = () => notifications() != null;

let ready: Promise<void> | null = null;

/** Shows reminders while the app is open too, and creates the Android channel. */
export function setupReminders() {
  const N = notifications();
  if (!N) return Promise.resolve();
  ready ??= (async () => {
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === 'android') {
      // Android 13+: the channel must exist before the permission is asked
      await N.setNotificationChannelAsync(CHANNEL, { name: t('Reading plan reminders'), importance: N.AndroidImportance.HIGH });
    }
  })().catch((e) => {
    ready = null;
    console.warn('[reminders] setup failed', e);
  });
  return ready;
}

async function permitted(N: Notifications) {
  if ((await N.getPermissionsAsync()).granted) return true;
  return (await N.requestPermissionsAsync()).granted;
}

export type ReminderResult = 'scheduled' | 'unavailable' | 'denied';

/** Replaces the plan's daily reminder. `time` is "HH:MM". */
export async function scheduleReminder(plan: { id: string; name: string; time: string }): Promise<ReminderResult> {
  const N = notifications();
  if (!N) return 'unavailable';
  await setupReminders();
  if (!(await permitted(N))) return 'denied';
  const [hour, minute] = plan.time.split(':').map(Number);
  await N.cancelScheduledNotificationAsync(id(plan.id)).catch(() => {});
  await N.scheduleNotificationAsync({
    identifier: id(plan.id),
    content: { title: plan.name, body: t("Time for today's reading") },
    trigger: {
      type: N.SchedulableTriggerInputTypes.DAILY,
      hour: Number.isFinite(hour) ? hour : 7,
      minute: Number.isFinite(minute) ? minute : 0,
      channelId: CHANNEL,
    },
  });
  return 'scheduled';
}

export async function cancelReminder(planId: string) {
  const N = notifications();
  if (!N) return;
  await N.cancelScheduledNotificationAsync(id(planId)).catch(() => {});
}

/** Makes the scheduled reminders match the plans (after a sync, restore or language change). */
export async function syncReminders(plans: { id: string; name: string; active: boolean; reminderEnabled: boolean; reminderTime: string }[]) {
  const N = notifications();
  if (!N) return;
  const wanted = new Set(plans.filter((p) => p.active && p.reminderEnabled).map((p) => id(p.id)));
  try {
    const scheduled = await N.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (n.identifier.startsWith('plan-') && !wanted.has(n.identifier)) await N.cancelScheduledNotificationAsync(n.identifier);
    }
    if (!wanted.size || !(await N.getPermissionsAsync()).granted) return;
    await setupReminders();
    for (const p of plans) {
      if (wanted.has(id(p.id))) await scheduleReminder({ id: p.id, name: p.name, time: p.reminderTime });
    }
  } catch (e) {
    console.warn('[reminders] could not update reminders', e);
  }
}
