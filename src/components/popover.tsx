/**
 * Small floating card (menus, quick settings); tap outside or press back to close.
 * Render it as the last child of the screen; `style` positions it inside the screen.
 */
import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

export function Popover({
  visible,
  onClose,
  style,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  /** position of the card: top/bottom/left/right */
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const theme = useTheme();
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }, style]}>{children}</View>
    </View>
  );
}

export function MenuItem({
  icon,
  label,
  onPress,
  right,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.item, pressed && { backgroundColor: theme.backgroundElement }]}>
      {icon && <Icon name={icon} size={20} color={theme.tint} />}
      <ThemedText numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    minWidth: 220,
    maxWidth: 320,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.one,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - 4,
    minHeight: 46,
    paddingHorizontal: Spacing.three,
  },
  label: { flex: 1, fontSize: 15 },
});
