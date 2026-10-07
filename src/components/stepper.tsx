/** Small − value + controls for numbers, times ("HH:MM") and days. */
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icons } from './icon';
import { ThemedText } from './themed-text';
import { IconButton } from './ui';

export function Stepper({
  value,
  label,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
  minusLabel,
  plusLabel,
}: {
  value: string;
  label?: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
  minusLabel: string;
  plusLabel: string;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { backgroundColor: theme.backgroundElement }]}>
      <IconButton icon={Icons.left} label={minusLabel} color={theme.tint} disabled={minusDisabled} onPress={onMinus} />
      <View style={styles.value}>
        <ThemedText type="smallBold" style={styles.center}>
          {value}
        </ThemedText>
        {label ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {label}
          </ThemedText>
        ) : null}
      </View>
      <IconButton icon={Icons.right} label={plusLabel} color={theme.tint} disabled={plusDisabled} onPress={onPlus} />
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

export function parseTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  return { hour: Number.isFinite(h) ? h : 7, minute: Number.isFinite(m) ? m : 0 };
}

/** Hour and minute (5-minute steps) of a "HH:MM" time. */
export function TimeStepper({
  value,
  onChange,
  labels,
}: {
  value: string;
  onChange: (time: string) => void;
  labels: { hour: string; minute: string; earlier: string; later: string };
}) {
  const { hour, minute } = parseTime(value);
  const set = (h: number, m: number) => onChange(`${pad((h + 24) % 24)}:${pad((m + 60) % 60)}`);
  return (
    <View style={styles.time}>
      <Stepper
        value={pad(hour)}
        label={labels.hour}
        onMinus={() => set(hour - 1, minute)}
        onPlus={() => set(hour + 1, minute)}
        minusLabel={labels.earlier}
        plusLabel={labels.later}
      />
      <Stepper
        value={pad(minute)}
        label={labels.minute}
        onMinus={() => set(hour, Math.ceil(minute / 5) * 5 - 5)}
        onPlus={() => set(hour, Math.floor(minute / 5) * 5 + 5)}
        minusLabel={labels.earlier}
        plusLabel={labels.later}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 12,
    paddingHorizontal: Spacing.one,
    paddingVertical: Spacing.one,
    alignSelf: 'flex-start',
  },
  value: { minWidth: 64, paddingHorizontal: Spacing.one },
  center: { textAlign: 'center' },
  time: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
