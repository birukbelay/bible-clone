/** Floating bar at the bottom of the reader: display options, auto-scroll, previous / next chapter. */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { Icons } from './icon';
import { IconButton } from './ui';

export const CHAPTER_BAR_HEIGHT = 60;

export function ChapterBar({
  bottom,
  book,
  chapter,
  playing,
  onSettings,
  onPlay,
  onPrev,
  onNext,
  onTitle,
}: {
  bottom: number;
  book: string;
  chapter: number;
  playing: boolean;
  onSettings: () => void;
  onPlay: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onTitle: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          bottom,
          left: insets.left + Spacing.three,
          right: insets.right + Spacing.three,
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
      ]}>
      <IconButton icon={Icons.settings} label="Reading options" color={theme.textSecondary} onPress={onSettings} />
      <IconButton
        icon={playing ? Icons.pause : Icons.play}
        label={playing ? 'Stop scrolling' : 'Scroll automatically'}
        color={playing ? theme.tint : theme.textSecondary}
        onPress={onPlay}
      />
      <View style={[styles.separator, { backgroundColor: theme.border }]} />
      <IconButton icon={Icons.left} label="Previous chapter" size={26} disabled={!onPrev} onPress={() => onPrev?.()} />
      <Pressable onPress={onTitle} style={({ pressed }) => [styles.title, pressed && styles.pressed]} accessibilityLabel="Books and chapters">
        <Text numberOfLines={1} style={[styles.book, { color: theme.text }]}>
          {book}
        </Text>
        <Text style={[styles.chapter, { color: theme.textSecondary }]}>Ch. {chapter}</Text>
      </Pressable>
      <IconButton icon={Icons.right} label="Next chapter" size={26} disabled={!onNext} onPress={() => onNext?.()} />
    </View>
  );
}

/** Full-screen reading: only previous / next chapter, and the way back out. */
export function ChapterArrows({
  bottom,
  onPrev,
  onNext,
  onExit,
}: {
  bottom: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onExit: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.arrows, { bottom, backgroundColor: theme.background, borderColor: theme.border }]}>
      <IconButton icon={Icons.left} label="Previous chapter" size={26} disabled={!onPrev} onPress={() => onPrev?.()} />
      <IconButton icon={Icons.fullscreenExit} label="Exit full screen" color={theme.textSecondary} onPress={onExit} />
      <IconButton icon={Icons.right} label="Next chapter" size={26} disabled={!onNext} onPress={() => onNext?.()} />
    </View>
  );
}

const styles = StyleSheet.create({
  arrows: {
    position: 'absolute',
    alignSelf: 'center',
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.92,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  bar: {
    position: 'absolute',
    height: CHAPTER_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  separator: { width: StyleSheet.hairlineWidth, height: 28, marginHorizontal: Spacing.one },
  title: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  book: { fontSize: 16, fontWeight: '700' },
  chapter: { fontSize: 12, marginTop: 1 },
  pressed: { opacity: 0.55 },
});
