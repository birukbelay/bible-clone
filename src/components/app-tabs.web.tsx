/**
 * Web tabs: a rail on the left on wide windows, a bar at the bottom on phones. (The native tabs'
 * web version is a floating pill at the top that covers the reader's header.)
 */
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

import { Icon, Icons, type IconName } from './icon';
import type { Interaction } from './ui';

/** narrowest window that gets the side rail */
const RAIL_MIN_WIDTH = 768;

export default function AppTabs() {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const [fullscreen] = useSetting(settings.fullscreen);
  // full screen belongs to the reader; the other tabs always keep the bar
  const pathname = usePathname();
  const hidden = fullscreen && pathname === '/';
  const rail = width >= RAIL_MIN_WIDTH;

  return (
    <Tabs style={[styles.fill, rail ? styles.row : styles.column, { backgroundColor: theme.background }]}>
      <TabSlot style={styles.fill} />
      {/* hidden, not removed: the triggers inside define the tabs */}
      <TabList
        style={[
          rail ? styles.rail : styles.bar,
          { backgroundColor: theme.background, borderColor: theme.border },
          hidden && styles.hidden,
        ]}>
        {rail && (
          <View style={[styles.logo, { backgroundColor: theme.tint }]}>
            <Text style={styles.logoText}>Fyn</Text>
          </View>
        )}
        <TabTrigger name="index" href="/" asChild>
          <TabButton icon={Icons.book} label={t('Read')} rail={rail} />
        </TabTrigger>
        <TabTrigger name="topics" href="/topics" asChild>
          <TabButton icon={Icons.topic} label={t('Topics')} rail={rail} />
        </TabTrigger>
        <TabTrigger name="search" href="/search" asChild>
          <TabButton icon={Icons.search} label={t('Search')} rail={rail} />
        </TabTrigger>
        <TabTrigger name="library" href="/library" asChild>
          <TabButton icon={Icons.library} label={t('Library')} rail={rail} />
        </TabTrigger>
        <TabTrigger name="settings" href="/settings" asChild>
          <TabButton icon={Icons.settings} label={t('Settings')} rail={rail} />
        </TabTrigger>
      </TabList>
    </Tabs>
  );
}

function TabButton({
  icon,
  label,
  rail,
  isFocused,
  style: _style, // TabTrigger's row layout; the item lays itself out
  ...props
}: TabTriggerSlotProps & { icon: IconName; label: string; rail: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      aria-label={label}
      aria-current={isFocused ? 'page' : undefined}
      style={rail ? styles.railItem : styles.barItem}>
      {({ hovered }: Interaction) => (
        <>
          <View
            style={[
              styles.indicator,
              isFocused ? { backgroundColor: theme.tintSoft } : hovered && { backgroundColor: theme.backgroundElement },
            ]}>
            <Icon name={icon} size={22} color={isFocused ? theme.tint : theme.textSecondary} />
          </View>
          <Text style={[styles.label, { color: isFocused ? theme.text : theme.textSecondary }, isFocused && styles.labelFocused]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: { flexDirection: 'row-reverse' },
  column: { flexDirection: 'column' },
  hidden: { display: 'none' },
  rail: {
    width: 88,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.three,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.one + 2,
    paddingBottom: Spacing.one + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  logoText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.3 },
  railItem: { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: Spacing.one, width: 72 },
  barItem: { flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 2 },
  indicator: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  labelFocused: { fontWeight: '700' },
});
