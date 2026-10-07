/**
 * Reader side drawer: verse of the day, shortcuts, and the book list with a chapter column.
 * Books of one testament at a time (tabs at the bottom; a third tab for the deuterocanonical
 * books when the version has them); tapping a book shows its chapters,
 * tapping a chapter opens it and closes the drawer. Swipe left or tap outside to close.
 */
import * as Clipboard from 'expo-clipboard';
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { bookOf, chapterOf, makeAri } from '@/bible/ari';
import { SECTION_NAMES, SECTIONS, sectionOf, type Section } from '@/bible/canon';
import { plainText } from '@/bible/markup';
import { getVerses, useAsync, type Book } from '@/bible/queries';
import { encodeRanges, formatRef } from '@/bible/reference';
import { verseOfDay } from '@/bible/verse-of-day';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings } from '@/settings';

import { share, showError, toast } from './dialogs';
import { Icon, Icons, type IconName } from './icon';
import { ThemedText } from './themed-text';
import type { Interaction } from './ui';

const BOOK_ROW = 52;
const CHAPTER_ROW = 48;

const SHORTCUTS: { label: string; icon: IconName; href: Href }[] = [
  { label: 'Search', icon: Icons.search, href: '/search' },
  { label: 'Bookmarks', icon: Icons.bookmark, href: { pathname: '/library', params: { section: 'bookmarks' } } },
  { label: 'Notes', icon: Icons.note, href: { pathname: '/library', params: { section: 'notes' } } },
  { label: 'Topics', icon: Icons.topic, href: '/topics' },
  { label: 'Plans', icon: Icons.plan, href: '/plans' },
  { label: 'Versions', icon: Icons.translate, href: '/version-picker' },
  { label: 'Today', icon: Icons.calendar, href: '/lectionary' as Href },
  { label: 'Memory', icon: Icons.memory, href: '/memory' as Href },
  { label: 'Prayers', icon: Icons.prayer, href: '/prayers' as Href },
  { label: 'Audio', icon: Icons.headphones, href: '/audio' as Href },
];

export function BookDrawer({
  open,
  onClose,
  versionId,
  versionName,
  books,
  position,
}: {
  open: boolean;
  onClose: () => void;
  versionId: string;
  versionName: string;
  books: Book[] | undefined;
  /** ari shown in the reader */
  position: number;
}) {
  const theme = useTheme();
  const t = useT();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.min(width * 0.86, 380 + insets.left);
  // stays mounted until the closing animation ends
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (!mounted) return;
    if (open) drag.set(0);
    progress.set(
      withTiming(open ? 1 : 0, { duration: 220 }, (finished) => {
        if (finished && !open) scheduleOnRN(setMounted, false);
      }),
    );
  }, [open, mounted, progress, drag]);

  const pan = Gesture.Pan()
    .activeOffsetX(-12)
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      drag.set(Math.min(0, e.translationX));
    })
    .onEnd((e) => {
      if (e.translationX < -panelWidth / 3 || e.velocityX < -800) scheduleOnRN(onClose);
      else drag.set(withTiming(0, { duration: 150 }));
    });

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.get() - 1) * panelWidth + drag.get() }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.get() * (1 + drag.get() / panelWidth),
  }));

  return (
    <Modal visible={mounted} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} accessibilityLabel={t('Close')} onPress={onClose} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.panel, { width: panelWidth, backgroundColor: theme.background }, panelStyle]}>
            {books && (
              <DrawerContent
                versionId={versionId}
                versionName={versionName}
                books={books}
                position={position}
                onClose={onClose}
              />
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DrawerContent({
  versionId,
  versionName,
  books,
  position,
  onClose,
}: {
  versionId: string;
  versionName: string;
  books: Book[];
  position: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const currentBook = bookOf(position);
  const [testament, setTestament] = useState(sectionOf(currentBook));
  const [browsed, setBrowsed] = useState(currentBook);

  const byTestament = (which: Section) => books.filter((b) => sectionOf(b.book) === which);
  const tabs = SECTIONS.filter((which) => which !== 'dc' || byTestament('dc').length > 0);
  const list = byTestament(testament);
  const book = list.find((b) => b.book === browsed) ?? list[0];
  const chapters = Array.from({ length: book?.chapters ?? 0 }, (_, i) => i + 1);
  const currentChapter = book?.book === currentBook ? chapterOf(position) : 0;

  const switchTestament = (which: Section) => {
    setTestament(which);
    setBrowsed(sectionOf(currentBook) === which ? currentBook : (byTestament(which)[0]?.book ?? 0));
  };

  const go = (chapter: number) => {
    if (!book) return;
    settings.position.set(makeAri(book.book, chapter, 1));
    onClose();
  };

  const navigate = (href: Href) => {
    onClose();
    router.navigate(href);
  };

  return (
    <>
      <VerseOfDay versionId={versionId} versionName={versionName} books={books} onClose={onClose} />

      <View style={[styles.shortcuts, { borderBottomColor: theme.border, paddingLeft: insets.left + Spacing.one }]}>
        {SHORTCUTS.map((s) => (
          <Pressable
            key={s.label}
            onPress={() => navigate(s.href)}
            style={({ pressed, hovered }: Interaction) => [
              styles.shortcut,
              hovered && { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}>
            <Icon name={s.icon} size={22} color={theme.tint} />
            <ThemedText type="small" numberOfLines={1} style={styles.shortcutLabel}>
              {t(s.label)}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <View style={[styles.lists, { paddingLeft: insets.left }]}>
        <FlatList
          key={testament}
          style={styles.fill}
          data={list}
          keyExtractor={(b) => String(b.book)}
          getItemLayout={(_, index) => ({ length: BOOK_ROW, offset: BOOK_ROW * index, index })}
          initialScrollIndex={Math.max(0, list.findIndex((b) => b.book === browsed) - 3)}
          renderItem={({ item }) => {
            const active = item.book === book?.book;
            return (
              <Pressable
                onPress={() => setBrowsed(item.book)}
                style={({ hovered }: Interaction) => [
                  styles.bookRow,
                  { borderBottomColor: theme.border },
                  hovered && { backgroundColor: theme.backgroundElement },
                  active && { backgroundColor: theme.tintSoft, borderLeftColor: theme.tint },
                ]}>
                <ThemedText
                  numberOfLines={1}
                  style={[styles.bookName, active && { color: theme.tint, fontWeight: '700' }]}>
                  {item.name}
                </ThemedText>
                <View style={[styles.pill, { borderColor: active ? theme.tint : 'transparent' }]}>
                  <Text style={[styles.pillText, { color: active ? theme.tint : theme.textSecondary }]}>{t('{count} ch', { count: item.chapters })}</Text>
                </View>
              </Pressable>
            );
          }}
        />
        <FlatList
          key={`${testament}:${book?.book}`}
          style={[styles.chapters, { borderLeftColor: theme.border, backgroundColor: theme.backgroundElement }]}
          data={chapters}
          keyExtractor={String}
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: CHAPTER_ROW, offset: CHAPTER_ROW * index, index })}
          initialScrollIndex={Math.max(0, currentChapter - 4)}
          renderItem={({ item }) => {
            const here = item === currentChapter;
            return (
              <Pressable
                onPress={() => go(item)}
                accessibilityLabel={t('Chapter {number}', { number: item })}
                style={({ pressed }) => [styles.chapter, pressed && styles.pressed]}>
                {({ hovered }: Interaction) => (
                <View style={[styles.chapterCell, hovered && { backgroundColor: theme.backgroundSelected }, here && { backgroundColor: theme.tint }]}>
                  <Text style={[styles.chapterText, { color: here ? '#ffffff' : theme.text }, here && styles.bold]}>{item}</Text>
                </View>
                )}
              </Pressable>
            );
          }}
        />
      </View>

      <View style={[styles.tabs, { borderTopColor: theme.border, paddingBottom: insets.bottom, paddingLeft: insets.left }]}>
        {tabs.map((which) => {
          const selected = which === testament;
          const color = selected ? theme.tint : theme.textSecondary;
          return (
            <Pressable
              key={which}
              onPress={() => switchTestament(which)}
              style={[styles.tab, { borderTopColor: selected ? theme.tint : 'transparent' }]}>
              <Text numberOfLines={1} style={[styles.tabTitle, { color }]}>
                {t(SECTION_NAMES[which].title)}
              </Text>
              <Text numberOfLines={1} style={[styles.tabSubtitle, { color }]}>
                {t(SECTION_NAMES[which].abbr)} · {t('{count} books', { count: byTestament(which).length })}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function VerseOfDay({
  versionId,
  versionName,
  books,
  onClose,
}: {
  versionId: string;
  versionName: string;
  books: Book[];
  onClose: () => void;
}) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 500; // landscape phone
  const ari = verseOfDay();
  const { data } = useAsync(() => getVerses(versionId, [ari]), [versionId, ari]);
  const text = data?.[0] ? plainText(data[0].text) : '';
  const reference = formatRef(books, ari);
  const message = `${text}\n— ${reference} (${versionName})`;

  return (
    <View style={[styles.votd, { paddingTop: insets.top + (compact ? Spacing.two : Spacing.three), paddingLeft: insets.left + Spacing.three }]}>
      <Pressable
        onPress={() => {
          settings.position.set(ari);
          onClose();
        }}>
        <Text style={styles.votdText} numberOfLines={compact ? 2 : 5}>
          {text}
        </Text>
        <Text style={styles.votdRef}>— {reference}</Text>
      </Pressable>
      <View style={styles.votdActions}>
        <VotdAction
          icon={Icons.pencil}
          label={t('Note')}
          onPress={() => {
            onClose();
            router.push({ pathname: '/note', params: { ranges: encodeRanges([{ ari, ariEnd: ari }]), version: versionId } });
          }}
        />
        <VotdAction icon={Icons.copy} label={t('Copy')} onPress={() => Clipboard.setStringAsync(message).then(() => toast(t('Copied')))} />
        <VotdAction icon={Icons.share} label={t('Share')} onPress={() => share(message).catch(showError(t('Could not share')))} />
      </View>
    </View>
  );
}

function VotdAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} hitSlop={6} style={({ pressed, hovered }: Interaction) => [styles.votdAction, hovered && styles.votdActionHovered, pressed && styles.pressed]}>
      <Icon name={icon} size={18} color="#ffffff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.55 },
  bold: { fontWeight: '700' },
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    boxShadow: '0 0 16px rgba(0, 0, 0, 0.25)',
  },
  votd: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
    // sunset over the hills
    experimental_backgroundImage:
      'linear-gradient(to bottom, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.45) 100%), linear-gradient(165deg, #1f2a48 0%, #5a3550 38%, #b4553f 72%, #f0a55a 100%)',
  },
  votdText: { color: '#ffffff', fontFamily: Fonts.serif, fontStyle: 'italic', fontSize: 17, lineHeight: 25 },
  votdRef: { color: 'rgba(255,255,255,0.85)', fontFamily: Fonts.serif, fontSize: 14, marginTop: Spacing.one },
  votdActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two },
  votdAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  votdActionHovered: { backgroundColor: 'rgba(255,255,255,0.3)' },
  shortcuts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.one,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  shortcut: { width: '20%', alignItems: 'center', gap: Spacing.one, paddingVertical: Spacing.one, borderRadius: 10 },
  shortcutLabel: { fontSize: 11, lineHeight: 14 },
  lists: { flex: 1, flexDirection: 'row' },
  bookRow: {
    height: BOOK_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three - 3,
    paddingRight: Spacing.two,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bookName: { flex: 1, fontSize: 15 },
  pill: { borderWidth: 1, borderRadius: 10, paddingHorizontal: Spacing.two - 2, paddingVertical: 1 },
  pillText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  chapters: { flexGrow: 0, width: 60, borderLeftWidth: StyleSheet.hairlineWidth },
  chapter: { height: CHAPTER_ROW, alignItems: 'center', justifyContent: 'center' },
  chapterCell: { width: 40, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  chapterText: { fontSize: 15 },
  tabs: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.one, paddingVertical: Spacing.two + 2, borderTopWidth: 3, gap: 1 },
  tabTitle: { fontSize: 15, fontWeight: '700' },
  tabSubtitle: { fontSize: 11 },
});
