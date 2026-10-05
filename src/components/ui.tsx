/** Small building blocks used by every screen. */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icon, type IconName } from './icon';
import { ThemedText } from './themed-text';

/** Pressable state. `hovered` (mouse over) comes from react-native-web; the RN typings lack it. */
export type Interaction = { pressed: boolean; hovered?: boolean };

/** Pressable props for a long press; in browsers a right click does the same. */
export function longPress(onLongPress: (() => void) | undefined): Partial<PressableProps> {
  if (!onLongPress || Platform.OS !== 'web') return { onLongPress };
  const onContextMenu = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    onLongPress();
  };
  return { onLongPress, onContextMenu } as Partial<PressableProps>;
}

export function Button({
  title,
  icon,
  onPress,
  kind = 'primary',
  disabled,
  style,
}: {
  title: string;
  icon?: IconName;
  onPress: () => void;
  kind?: 'primary' | 'plain' | 'danger';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const fg = kind === 'primary' ? '#ffffff' : kind === 'danger' ? theme.danger : theme.tint;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: Interaction) => [
        styles.button,
        { backgroundColor: kind === 'primary' ? theme.tint : theme.backgroundElement },
        hovered && styles.hovered,
        (pressed || disabled) && styles.dimmed,
        style,
      ]}>
      {icon && <Icon name={icon} size={18} color={fg} />}
      <ThemedText type="smallBold" style={{ color: fg }}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  color,
  size = 22,
  label,
  disabled,
}: {
  icon: IconName;
  onPress: () => void;
  color?: string;
  size?: number;
  label: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed, hovered }: Interaction) => [
        styles.iconButton,
        hovered && !disabled && { backgroundColor: theme.backgroundElement },
        (pressed || disabled) && styles.dimmed,
      ]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function Row({
  title,
  subtitle,
  detail,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: PressableProps['onPress'];
  onLongPress?: () => void;
  chevron?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      {...longPress(onLongPress)}
      disabled={!onPress && !onLongPress}
      style={({ pressed, hovered }: Interaction) => [
        styles.row,
        { borderBottomColor: theme.border },
        (pressed || hovered) && { backgroundColor: theme.backgroundElement },
      ]}>
      {left}
      <View style={styles.rowBody}>
        {typeof title === 'string' ? <ThemedText numberOfLines={2}>{title}</ThemedText> : title}
        {typeof subtitle === 'string' ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
            {subtitle}
          </ThemedText>
        ) : (
          subtitle
        )}
      </View>
      {typeof detail === 'string' || typeof detail === 'number' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      ) : (
        detail
      )}
      {right}
      {chevron && <Icon name={{ ios: 'chevron.right', md: 'chevron_right' }} size={16} color={theme.textSecondary} />}
    </Pressable>
  );
}

export function SwitchRow({ title, value, onChange, subtitle }: { title: string; value: boolean; onChange: (v: boolean) => void; subtitle?: string }) {
  return <Row title={title} subtitle={subtitle} right={<Switch value={value} onValueChange={onChange} />} />;
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
        {title.toUpperCase()}
      </ThemedText>
      {right}
    </View>
  );
}

export function Empty({ title, message, children }: { title: string; message?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="smallBold" style={styles.center}>
        {title}
      </ThemedText>
      {message && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      )}
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator />
    </View>
  );
}

export function Field(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[styles.field, { color: theme.text, backgroundColor: theme.backgroundElement }, props.style]}
    />
  );
}

/** Pill-shaped toggle; used for segmented controls and tag chips. */
export function Chip({
  label,
  selected,
  onPress,
  onLongPress,
  color,
  right,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  color?: string;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      {...longPress(onLongPress)}
      style={({ pressed, hovered }: Interaction) => [
        styles.chip,
        { backgroundColor: selected ? (color ?? theme.tint) : hovered ? theme.backgroundSelected : theme.backgroundElement },
        pressed && styles.dimmed,
      ]}>
      {color && !selected && <View style={[styles.dot, { backgroundColor: color }]} />}
      <ThemedText type="small" style={{ color: selected ? '#ffffff' : theme.text }}>
        {label}
      </ThemedText>
      {right}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o) => (
        <Chip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: 12,
  },
  dimmed: { opacity: 0.55 },
  hovered: { opacity: 0.88 },
  iconButton: { padding: Spacing.one, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two + 4,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
  },
  sectionTitle: { letterSpacing: 0.5 },
  empty: { padding: Spacing.five, alignItems: 'center', gap: Spacing.three },
  center: { textAlign: 'center' },
  field: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, fontSize: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three - 4,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  segmented: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
