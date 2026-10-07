/**
 * Reader: one chapter of the current version, optionally side by side with a second version
 * (split view, rows aligned by verse). Tap verses to select them, then bookmark, highlight,
 * note, tag, copy/share, or open the study view (Strong's words + cross references).
 * The drawer (menu button) lists books and chapters; the floating bar at the bottom moves
 * between chapters. Full screen hides the header, the tab bar and the status bar and keeps only
 * the previous / next chapter arrows.
 */
import * as Clipboard from 'expo-clipboard';
import { router, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { bookOf, chapterOf, isSameChapter, verseOf } from '@/bible/ari';
import { canonStatus, isExtraVerse } from '@/bible/canon';
import { plainText } from '@/bible/markup';
import { getBooks, getChapter, getRange, useAsync, type Extra, type Verse } from '@/bible/queries';
import { adjacentChapter, encodeRanges, formatRef, selectionToRanges, type VerseRange } from '@/bible/reference';
import { useCurrentVersion, useSplitVersion, useVersions, type BibleVersion } from '@/bible/versions';
import { BookDrawer } from '@/components/book-drawer';
import { CHAPTER_BAR_HEIGHT, ChapterArrows, ChapterBar } from '@/components/chapter-bar';
import { confirm, share, showError, toast } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { MenuItem, Popover } from '@/components/popover';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, IconButton, Segmented, type Interaction } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { HighlightColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { addBookmarks, removeBookmarks, setHighlight, setRead } from '@/db/actions';
import { marksOf, useChapterMarks, type VerseMarks } from '@/db/annotations';
import { requestBrowserFullscreen, useBrowserFullscreen, useDocumentTitle, useReaderShortcuts } from '@/hooks/use-reader-shortcuts';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { useDueReadings } from '@/plans';
import { settings, useSetting } from '@/settings';

const HEADER_HEIGHT = 52;
/** space between the split view's columns, where the divider is drawn */
const GUTTER = 26;
/** split view on wide screens (desktop browsers, tablets): wider page, columns and gutter */
const WIDE_SPLIT = 900;
const MAX_SPLIT_WIDTH = 1600;
const WIDE_GUTTER = 48;
/** auto-scroll speed at the default text size, px/s */
const SCROLL_SPEED = 26;

/** One scroll unit: a verse (single view) or a row of both versions' verses (split view). */
type Unit = { ari: number; ariEnd: number; left: Verse[]; right: Verse[] };

/**
 * Pairs two versions' verses of a chapter. Verses whose ranges overlap share a row, so a merged
 * "2-3" in one version sits next to 2 and 3 of the other.
 */
function pairVerses(left: Verse[], right: Verse[]): Unit[] {
  const all = [...left.map((v) => ({ v, side: 'left' as const })), ...right.map((v) => ({ v, side: 'right' as const }))];
  all.sort((a, b) => a.v.ari - b.v.ari || (a.side === 'left' ? -1 : 1));
  const units: Unit[] = [];
  for (const { v, side } of all) {
    let unit = units.at(-1);
    if (!unit || v.ari > unit.ariEnd) units.push((unit = { ari: v.ari, ariEnd: v.ari_end, left: [], right: [] }));
    unit[side].push(v);
    unit.ariEnd = Math.max(unit.ariEnd, v.ari_end);
  }
  return units;
}

function groupExtras(extras: Extra[] | undefined) {
  const titles = new Map<number, string[]>();
  const footnotes = new Map<number, string[]>();
  extras?.forEach((x) => {
    const map = x.kind === 'title' ? titles : footnotes;
    map.set(x.ari, [...(map.get(x.ari) ?? []), x.text]);
  });
  return { titles, footnotes };
}

type Extras = ReturnType<typeof groupExtras>;

/** Which verses show their notes: all when the setting is on, and the ones flipped by their marker. */
type NotesState = { isOpen: (ari: number) => boolean; toggle: (ari: number) => void };

export default function ReaderScreen() {
  const theme = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const tabBottomInset = useTabBottomInset();
  const focused = useIsFocused();
  const [fullscreen, setFullscreen] = useSetting(settings.fullscreen);
  // the tab bar is gone, so only the phone's own bottom edge is left to avoid
  const bottomInset = fullscreen ? insets.bottom + Spacing.two : tabBottomInset;
  const version = useCurrentVersion();
  const splitVersion = useSplitVersion();
  const { versions } = useVersions();
  const [fontSize] = useSetting(settings.fontSize);
  const [redLetters] = useSetting(settings.redLetters);
  const [showStrongs] = useSetting(settings.showStrongs);
  const [showNotes, setShowNotes] = useSetting(settings.showNotes);
  const [splitOn, setSplitOn] = useSetting(settings.split);
  const [ratio, setRatio] = useSetting(settings.splitRatio);
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState<'more' | 'options' | null>(null);

  // where to scroll; changes only on explicit jumps (scrolling stores the position silently)
  const [target, setTarget] = useState(() => ({ ari: settings.position.get() }));
  useEffect(() => settings.position.subscribe(() => setTarget({ ari: settings.position.get() })), []);
  const chapterAri = target.ari & ~255;

  const versionId = version?.id ?? '';
  const sideId = splitOn && versions.length > 1 && splitVersion ? splitVersion.id : null;
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  // both versions in one load, so the rows never mix chapters
  const { data, error } = useAsync(
    async () => ({
      key: `${versionId}|${sideId}|${chapterAri}`,
      sideId,
      main: await getChapter(versionId, chapterAri),
      side: sideId ? await getChapter(sideId, chapterAri) : null,
    }),
    [versionId, sideId, chapterAri],
  );
  const marks = useChapterMarks(chapterAri);
  const split = !!data?.side;
  const side = split ? versions.find((v) => v.id === data.sideId) : undefined;
  const units = data ? pairVerses(data.main.verses, data.side?.verses ?? []) : [];
  const mainExtras = groupExtras(data?.main.extras);
  const sideExtras = groupExtras(data?.side?.extras);

  const [selection, setSelection] = useState({ chapterAri, aris: new Set<number>() });
  const selected = selection.chapterAri === chapterAri ? selection.aris : new Set<number>();
  const clearSelection = () => setSelection({ chapterAri, aris: new Set() });
  const toggle = (ari: number) => {
    const next = new Set(selected);
    if (next.has(ari)) next.delete(ari);
    else next.add(ari);
    setSelection({ chapterAri, aris: next });
  };
  const ranges = selectionToRanges(selected, units);

  // notes opened (or, with all notes shown, closed) one verse at a time, until the chapter changes
  const [flipped, setFlipped] = useState({ key: '', aris: new Set<string>() });
  const flippedHere = flipped.key === data?.key ? flipped.aris : new Set<string>();
  const notesState = (column: 'main' | 'side'): NotesState => ({
    isOpen: (ari) => showNotes !== flippedHere.has(`${column}:${ari}`),
    toggle: (ari) => {
      const next = new Set(flippedHere);
      const id = `${column}:${ari}`;
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setFlipped({ key: data?.key ?? '', aris: next });
    },
  });
  const noteCount = [...mainExtras.footnotes.values(), ...sideExtras.footnotes.values()].reduce((n, list) => n + list.length, 0);
  const toggleAllNotes = () => {
    setFlipped({ key: '', aris: new Set() });
    setShowNotes(!showNotes);
  };
  const extraChapter = canonStatus(chapterAri | 1);

  // ---- scrolling ----
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef(new Map<number, { y: number; height: number }>());
  const layoutsKey = useRef<string | undefined>(undefined);
  const pendingScroll = useRef<number | null>(null);
  const offset = useRef(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const contentHeight = useRef(0);

  // layout effect: armed before the new rows' onLayout events arrive
  useLayoutEffect(() => {
    const ari = settings.position.get(); // the jump target, or where scrolling left off (version switch)
    const want = isSameChapter(ari, chapterAri) && verseOf(ari) > 1 ? ari : null;
    pendingScroll.current = want;
    if (want == null) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    // a jump within the chapter on screen: its rows will not lay out again
    if (data && layoutsKey.current === data.key) {
      const unit = units.find((u) => want >= u.ari && want <= u.ariEnd);
      const layout = unit && layouts.current.get(unit.ari);
      if (layout) {
        pendingScroll.current = null;
        scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - Spacing.two), animated: false });
      }
    }
    // only on a new chapter or jump; later row layouts are handled by onUnitLayout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, data?.key, chapterAri]);

  const onUnitLayout = (key: string, unit: Unit, e: LayoutChangeEvent) => {
    if (layoutsKey.current !== key) {
      layouts.current.clear();
      layoutsKey.current = key;
    }
    layouts.current.set(unit.ari, e.nativeEvent.layout);
    const want = pendingScroll.current;
    if (want != null && want >= unit.ari && want <= unit.ariEnd) {
      pendingScroll.current = null;
      scrollRef.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - Spacing.two), animated: false });
    }
  };

  const savePosition = (y: number) => {
    if (!isSameChapter(settings.position.get(), chapterAri)) return; // already moved on
    for (const u of units) {
      const l = layouts.current.get(u.ari);
      if (l && l.y + l.height > y + Spacing.three) {
        settings.position.set(u.ari, false);
        return;
      }
    }
  };
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => savePosition(e.nativeEvent.contentOffset.y);

  // ---- auto-scroll (play button) ----
  const [playing, setPlaying] = useState(false);
  const [lastChapter, setLastChapter] = useState(chapterAri);
  if (lastChapter !== chapterAri) {
    setLastChapter(chapterAri);
    setPlaying(false);
  }
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last: number | null = null;
    let y = offset.current;
    const step = (now: number) => {
      const dt = last == null ? 0 : Math.min(64, now - last);
      last = now;
      y += (SCROLL_SPEED * settings.scrollSpeed.get() * (settings.fontSize.get() / 19) * dt) / 1000;
      const end = contentHeight.current - viewport.height;
      if (end > 0 && y >= end) {
        scrollRef.current?.scrollTo({ y: end, animated: false });
        setPlaying(false);
        return;
      }
      scrollRef.current?.scrollTo({ y, animated: false });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      savePosition(y);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savePosition reads refs and settings
  }, [playing, viewport.height]);

  // back leaves full screen first
  useEffect(() => {
    if (!fullscreen || !focused) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setFullscreen is a new function each render
  }, [fullscreen, focused]);

  const prev = adjacentChapter(books, chapterAri, -1);
  const next = adjacentChapter(books, chapterAri, 1);
  const go = (ari: number | null) => {
    if (ari != null) settings.position.set(ari);
  };
  const enterFullscreen = () => {
    requestBrowserFullscreen();
    setFullscreen(true);
  };

  // web: keyboard, and the browser's own full screen
  useBrowserFullscreen(fullscreen, () => setFullscreen(false));
  useReaderShortcuts({
    enabled: focused && !drawer,
    onPrev: () => go(prev),
    onNext: () => go(next),
    onToggleFullscreen: () => (fullscreen ? setFullscreen(false) : enterFullscreen()),
    onEscape: () => {
      if (menu) setMenu(null);
      else if (selected.size) clearSelection();
      else if (fullscreen) setFullscreen(false);
    },
  });
  const book = books?.find((b) => b.book === bookOf(chapterAri));
  const bookTitle = book?.name ?? '';
  const chapter = chapterOf(chapterAri);
  useDocumentTitle(focused && book && version ? `${bookTitle} ${chapter} (${version.shortName}) · Fyn Bible` : null);

  if (!version) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background, paddingTop: insets.top }]}>
        <Empty title={t('No Bible versions installed')} message={t('Add a version in Settings.')}>
          <Button title={t('Manage versions')} onPress={() => router.navigate('/settings')} />
        </Empty>
      </View>
    );
  }

  // split view geometry: rows are laid out in pixels so the divider overlay lines up with them.
  // Two columns get about twice the single column's width (desktop browsers, tablets).
  const wide = viewport.width >= WIDE_SPLIT;
  const maxWidth = split ? MAX_SPLIT_WIDTH : MaxContentWidth;
  const contentWidth = Math.min(viewport.width, maxWidth);
  const padding = split ? (wide ? Spacing.four : Spacing.two + 2) : Spacing.three;
  const gutter = split && wide ? WIDE_GUTTER : GUTTER;
  const sideInset = Math.max(insets.left, insets.right);
  const usable = Math.max(0, contentWidth - 2 * (padding + sideInset) - gutter);
  const leftWidth = Math.round(usable * ratio);
  const dividerX = (viewport.width - contentWidth) / 2 + padding + sideInset + leftWidth + gutter / 2;
  // smaller text only when the columns are narrow (phones)
  const verseFont = split && Math.min(leftWidth, usable - leftWidth) < 360 ? Math.max(12, fontSize - 3) : fontSize;

  const toggleSplit = () => {
    if (versions.length < 2) {
      confirm({ title: t('Split view needs two versions'), message: t('Add another version in Settings.'), confirmText: t('Settings') }).then((ok) => {
        if (ok) router.navigate('/settings');
      });
      return;
    }
    setSplitOn(!splitOn);
  };

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      {focused && <StatusBar hidden={fullscreen} />}
      {!fullscreen && (
        <View
          style={[
            styles.header,
            {
              height: insets.top + HEADER_HEIGHT,
              paddingTop: insets.top,
              paddingLeft: insets.left + Spacing.two,
              paddingRight: insets.right + Spacing.two,
              backgroundColor: theme.background,
              borderBottomColor: theme.border,
            },
          ]}>
          <View style={styles.headerSide}>
            <IconButton icon={Icons.menu} label={t('Books and chapters')} size={26} onPress={() => setDrawer(true)} />
          </View>
          <Pressable
            onPress={() => router.push('/version-picker')}
            accessibilityLabel={t('Change version')}
            style={({ pressed, hovered }: Interaction) => [
              styles.tab,
              { backgroundColor: theme.tint },
              hovered && styles.hovered,
              pressed && styles.pressed,
            ]}>
            <Text numberOfLines={1} style={styles.tabVersion}>
              {split && side ? `${version.shortName} | ${side.shortName}` : version.shortName}
            </Text>
            <Text numberOfLines={1} style={styles.tabPassage}>
              {bookTitle} · {t('Ch.{chapter}', { chapter })}
            </Text>
          </Pressable>
          <View style={[styles.headerSide, styles.headerActions]}>
            <IconButton icon={Icons.search} label={t('Search')} color={theme.textSecondary} onPress={() => router.navigate('/search')} />
            <IconButton
              icon={splitOn ? Icons.splitOn : Icons.split}
              label={splitOn ? t('Single version') : t('Show two versions side by side')}
              color={splitOn ? theme.tint : theme.textSecondary}
              onPress={toggleSplit}
            />
            <IconButton icon={Icons.fullscreen} label={t('Full screen')} color={theme.textSecondary} onPress={enterFullscreen} />
            <IconButton icon={Icons.moreVertical} label={t('More')} color={theme.textSecondary} onPress={() => setMenu('more')} />
          </View>
        </View>
      )}

      <View style={styles.fill} onLayout={(e) => setViewport(e.nativeEvent.layout)}>
        <ScrollView
          ref={scrollRef}
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            {
              maxWidth,
              paddingHorizontal: padding + sideInset,
              paddingTop: (fullscreen ? insets.top : 0) + Spacing.three,
              paddingBottom: bottomInset + CHAPTER_BAR_HEIGHT + (selected.size ? 200 : Spacing.five),
            },
          ]}
          scrollEventThrottle={32}
          onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
          onContentSizeChange={(_, h) => (contentHeight.current = h)}
          onScrollBeginDrag={() => setPlaying(false)}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={onScrollEnd}>
          {error ? (
            <Empty title={t('Could not load this chapter')} message={error.message} />
          ) : data && !units.length ? (
            <Empty title={t('This chapter is not in this version')} />
          ) : null}
          {!fullscreen && <PlanBanner chapterAri={chapterAri} />}
          {data && units.length > 0 && extraChapter !== 'canon' && (
            <View style={[styles.canonNotice, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.canonText}>
                {extraChapter === 'book'
                  ? t('This book is not in the 66-book canon (deuterocanonical / Orthodox).')
                  : t('This chapter is not in the 66-book canon (extra chapter).')}
              </ThemedText>
            </View>
          )}
          {data && noteCount > 0 && (
            <Pressable
              onPress={toggleAllNotes}
              accessibilityRole="button"
              style={({ pressed, hovered }: Interaction) => [
                styles.notesBar,
                { borderColor: theme.border },
                hovered && { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Icon name={Icons.notes} size={16} color={theme.tint} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.fill}>
                {noteCount === 1 ? t('1 note in this chapter') : t('{count} notes in this chapter', { count: noteCount })}
              </ThemedText>
              <ThemedText type="smallBold" themeColor="tint">
                {showNotes ? t('Collapse all') : t('Expand all')}
              </ThemedText>
              <Icon name={showNotes ? Icons.up : Icons.down} size={18} color={theme.tint} />
            </Pressable>
          )}
          {data &&
            units.map((u) => {
              const unitMarks = marksOf(marks, u.ari, u.ariEnd);
              const highlight = unitMarks.highlight != null ? HighlightColors[unitMarks.highlight] : undefined;
              const isSelected = selected.has(u.ari);
              const mainColumn = (
                <Column
                  verses={u.left}
                  extras={mainExtras}
                  notes={notesState('main')}
                  fontSize={verseFont}
                  labelColor={theme.tint}
                  redLetters={redLetters}
                  showStrongs={showStrongs && version.strongs}
                />
              );
              return (
                <Pressable
                  key={`${data.key}:${u.ari}`}
                  onLayout={(e) => onUnitLayout(data.key, u, e)}
                  onPress={() => toggle(u.ari)}
                  style={[
                    split ? [styles.splitRow, { borderBottomColor: theme.border }] : styles.verse,
                    !split && u.left[0]?.para ? styles.paragraph : null,
                    highlight && { backgroundColor: highlight },
                    isSelected && { backgroundColor: theme.backgroundSelected, borderLeftColor: theme.tint },
                  ]}>
                  {split ? (
                    <View style={[styles.splitColumns, { gap: gutter }]}>
                      <View style={{ width: leftWidth }}>
                        {mainColumn}
                        <Marks marks={unitMarks} />
                      </View>
                      <View style={{ width: usable - leftWidth }}>
                        <Column
                          verses={u.right}
                          extras={sideExtras}
                          notes={notesState('side')}
                          fontSize={verseFont}
                          labelColor={theme.splitTint}
                          redLetters={redLetters}
                          showStrongs={showStrongs && !!side?.strongs}
                        />
                      </View>
                    </View>
                  ) : (
                    <>
                      {mainColumn}
                      <Marks marks={unitMarks} />
                    </>
                  )}
                </Pressable>
              );
            })}
        </ScrollView>

        {split && side && viewport.width > 0 && (
          <SplitDivider
            x={dividerX}
            height={viewport.height}
            leftWidth={leftWidth}
            usable={usable}
            left={version}
            right={side}
            onRatio={setRatio}
          />
        )}

        {selected.size > 0 ? (
          <SelectionBar
            ranges={ranges}
            versionId={version.id}
            reference={ranges.map((r) => formatRef(books, r.ari, r.ariEnd)).join('; ')}
            versionName={version.shortName}
            bookmarked={ranges.every((r) => marksOf(marks, r.ari, r.ariEnd).bookmark)}
            bottom={bottomInset}
            onDone={clearSelection}
          />
        ) : fullscreen ? (
          <ChapterArrows
            bottom={bottomInset}
            onPrev={prev == null ? null : () => go(prev)}
            onNext={next == null ? null : () => go(next)}
            onExit={() => setFullscreen(false)}
          />
        ) : (
          <ChapterBar
            bottom={bottomInset}
            book={bookTitle}
            chapter={chapter}
            playing={playing}
            onSettings={() => setMenu('options')}
            onPlay={() => setPlaying(!playing)}
            onPrev={prev == null ? null : () => go(prev)}
            onNext={next == null ? null : () => go(next)}
            onTitle={() => setDrawer(true)}
          />
        )}

        <Popover visible={menu === 'options'} onClose={() => setMenu(null)} style={[styles.optionsPopover, { bottom: bottomInset + CHAPTER_BAR_HEIGHT + Spacing.two }]}>
          <ReadingOptions canSplit={versions.length > 1} />
        </Popover>
      </View>

      <Popover visible={menu === 'more'} onClose={() => setMenu(null)} style={[styles.morePopover, { top: insets.top + HEADER_HEIGHT - Spacing.one }]}>
        <MoreMenu split={split} onClose={() => setMenu(null)} onFullscreen={enterFullscreen} />
      </Popover>

      <BookDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        versionId={version.id}
        versionName={version.shortName}
        books={books}
        position={target.ari}
      />
    </View>
  );
}

/**
 * One version's verses of a row, with their section titles and notes. A verse with notes ends
 * with a small marker that opens / closes them; verses the KJV doesn't have are tagged "extra".
 */
function Column({
  verses,
  extras,
  notes,
  fontSize,
  labelColor,
  redLetters,
  showStrongs,
}: {
  verses: Verse[];
  extras: Extras;
  notes: NotesState;
  fontSize: number;
  labelColor: string;
  redLetters: boolean;
  showStrongs: boolean;
}) {
  const theme = useTheme();
  const t = useT();
  return verses.map((v) => {
    const footnotes = extras.footnotes.get(v.ari);
    const open = !!footnotes && notes.isOpen(v.ari);
    const marker = footnotes ? (
      <Text
        onPress={() => notes.toggle(v.ari)}
        accessibilityRole="button"
        accessibilityLabel={open ? t('Hide notes') : t('Show notes')}
        style={[styles.noteMarker, { color: theme.tint, fontSize: Math.max(11, fontSize * 0.62) }]}>
        {/* non-breaking spaces keep the marker in one piece at the end of the line */}
        {`\u00a0\u00a0${footnotes.length > 1 ? t('{count} notes', { count: footnotes.length }) : t('note')}\u00a0${open ? '▴' : '▾'}`}
      </Text>
    ) : null;
    return (
      <View key={v.ari}>
        {extras.titles.get(v.ari)?.map((title, i) => (
          <VerseText key={i} text={title} fontSize={fontSize - 2} style={[styles.heading, { color: theme.textSecondary }]} />
        ))}
        <VerseText
          text={v.text}
          label={v.label}
          labelColor={labelColor}
          badge={isExtraVerse(v.ari, v.ari_end) ? t('extra') : undefined}
          fontSize={fontSize}
          redLetters={redLetters}
          showStrongs={showStrongs}
          onStrongPress={(n) => router.push({ pathname: '/strongs/[number]', params: { number: n } })}
          trailing={marker}
        />
        {open && (
          <View style={[styles.footnotes, { borderLeftColor: theme.tint }]}>
            {footnotes.map((note, i) => (
              <ThemedText key={i} type="small" themeColor="textSecondary" style={styles.footnote}>
                {plainText(note)}
              </ThemedText>
            ))}
          </View>
        )}
      </View>
    );
  });
}

/** Today's reading of the active plans (and any missed ones), above the chapter. */
function PlanBanner({ chapterAri }: { chapterAri: number }) {
  const theme = useTheme();
  const t = useT();
  const due = useDueReadings();
  const [hidden, setHidden] = useState<string | null>(null);
  const first = due?.[0];
  // hidden until there is a different reading to show
  if (!first || hidden === first.id) return null;
  const here = isSameChapter(first.ari, chapterAri);
  return (
    <View style={[styles.planBanner, { backgroundColor: theme.tintSoft }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/plan/[id]', params: { id: first.planId } })}
        style={({ pressed }: Interaction) => [styles.planText, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor={first.late ? 'danger' : 'tint'} numberOfLines={1}>
          {first.late ? t('Missed reading') : t("Today's reading")} · {first.planName}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {first.label}
          {due.length > 1 ? `  ${t('+{count} more', { count: due.length - 1 })}` : ''}
        </ThemedText>
      </Pressable>
      {!here && <IconButton icon={Icons.open} label={t('Read {passage}', { passage: first.label })} color={theme.tint} onPress={() => settings.position.set(first.ari)} />}
      <IconButton
        icon={Icons.checkCircle}
        label={t('Mark as read')}
        color={theme.tint}
        onPress={() => setRead(first.record, true).catch(showError(t('Could not save')))}
      />
      <IconButton icon={Icons.close} label={t('Hide')} size={18} color={theme.textSecondary} onPress={() => setHidden(first.id)} />
    </View>
  );
}

function Marks({ marks }: { marks: VerseMarks }) {
  const theme = useTheme();
  if (!marks.bookmark && !marks.noteIds?.length && !marks.tagColors?.length) return null;
  return (
    <View style={styles.marks}>
      {marks.bookmark && <Icon name={Icons.bookmarkFill} size={14} color={theme.tint} />}
      {marks.noteIds?.length ? (
        <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/note', params: { id: marks.noteIds![0] } })}>
          <Icon name={Icons.note} size={14} color={theme.tint} />
        </Pressable>
      ) : null}
      {marks.tagColors?.map((c) => <View key={c} style={[styles.tagDot, { backgroundColor: c }]} />)}
    </View>
  );
}

/**
 * Line between the split view's columns, with each column's version (tap to change it) and a
 * handle that drags the line to resize the columns.
 */
function SplitDivider({
  x,
  height,
  leftWidth,
  usable,
  left,
  right,
  onRatio,
}: {
  x: number;
  height: number;
  leftWidth: number;
  usable: number;
  left: BibleVersion;
  right: BibleVersion;
  onRatio: (ratio: number) => void;
}) {
  const theme = useTheme();
  const t = useT();
  const drag = useSharedValue(0);
  const min = usable * 0.25 - leftWidth;
  const max = usable * 0.75 - leftWidth;
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      drag.set(Math.min(max, Math.max(min, e.translationX)));
    })
    .onEnd(() => {
      const ratio = (leftWidth + drag.get()) / usable;
      scheduleOnRN(onRatio, Math.round(ratio * 100) / 100);
    });
  // the new ratio re-renders the rows with the line at its new place
  useLayoutEffect(() => drag.set(0), [x, drag]);
  const lineStyle = useAnimatedStyle(() => ({ transform: [{ translateX: drag.get() }] }));

  const label = (version: BibleVersion, color: string, top: number, slot?: 'split') => (
    <Pressable
      accessibilityLabel={t('Change {name}', { name: version.shortName })}
      onPress={() => router.push({ pathname: '/version-picker', params: slot ? { slot } : {} })}
      style={[styles.sideLabel, { top: top + LABEL_LENGTH / 2 - 12 }]}>
      <View style={[styles.sideLabelChip, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <Text numberOfLines={1} style={[styles.sideLabelText, { color }]}>
          {/* the label is turned -90°: ▴ ends up pointing left, ▾ right, towards the version's column */}
          {version.shortName} {slot ? '▾' : '▴'}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <Animated.View style={[styles.divider, { left: x - GUTTER / 2, height }, lineStyle]}>
      <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
      {label(left, theme.tint, Spacing.three)}
      {label(right, theme.splitTint, Spacing.three + LABEL_LENGTH + Spacing.two, 'split')}
      <GestureDetector gesture={pan}>
        <View style={[styles.handleArea, { top: height / 2 - 40 }]} accessibilityLabel={t('Drag to resize columns')}>
          <View style={[styles.handle, { backgroundColor: theme.background, borderColor: theme.textSecondary }]} />
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

const LABEL_LENGTH = 120;

function ReadingOptions({ canSplit }: { canSplit: boolean }) {
  const theme = useTheme();
  const t = useT();
  const [fontSize, setFontSize] = useSetting(settings.fontSize);
  const [redLetters, setRedLetters] = useSetting(settings.redLetters);
  const [showStrongs, setShowStrongs] = useSetting(settings.showStrongs);
  const [showNotes, setShowNotes] = useSetting(settings.showNotes);
  const [split, setSplit] = useSetting(settings.split);
  const [speed, setSpeed] = useSetting(settings.scrollSpeed);
  const [appTheme, setAppTheme] = useSetting(settings.theme);
  const stepper = (value: string, onLess: (() => void) | null, onMore: (() => void) | null, less: string, more: string) => (
    <View style={styles.stepper}>
      <IconButton icon={Icons.textSmaller} label={less} color={theme.tint} disabled={!onLess} onPress={() => onLess?.()} />
      <ThemedText style={styles.stepperValue}>{value}</ThemedText>
      <IconButton icon={Icons.textLarger} label={more} color={theme.tint} disabled={!onMore} onPress={() => onMore?.()} />
    </View>
  );
  return (
    <>
      <MenuItem
        label={t('Text size')}
        right={stepper(
          String(fontSize),
          fontSize > 12 ? () => setFontSize(fontSize - 1) : null,
          fontSize < 34 ? () => setFontSize(fontSize + 1) : null,
          t('Smaller text'),
          t('Larger text'),
        )}
      />
      <MenuItem
        label={t('Scroll speed')}
        right={stepper(
          `${speed}×`,
          speed > 0.25 ? () => setSpeed(Math.round((speed - 0.25) * 100) / 100) : null,
          speed < 4 ? () => setSpeed(Math.round((speed + 0.25) * 100) / 100) : null,
          t('Slower'),
          t('Faster'),
        )}
      />
      <View style={styles.themeRow}>
        <Segmented
          options={[
            { value: 'system', label: t('System') },
            { value: 'light', label: t('Light') },
            { value: 'dark', label: t('Dark') },
          ]}
          value={appTheme}
          onChange={setAppTheme}
        />
      </View>
      <MenuItem label={t('Words of Jesus in red')} right={<Switch value={redLetters} onValueChange={setRedLetters} />} />
      <MenuItem label={t("Strong's numbers")} right={<Switch value={showStrongs} onValueChange={setShowStrongs} />} />
      <MenuItem label={t('Expand all notes')} right={<Switch value={showNotes} onValueChange={setShowNotes} />} />
      {canSplit && <MenuItem label={t('Two versions side by side')} right={<Switch value={split} onValueChange={setSplit} />} />}
    </>
  );
}

function MoreMenu({ split, onClose, onFullscreen }: { split: boolean; onClose: () => void; onFullscreen: () => void }) {
  const t = useT();
  const open = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <>
      <MenuItem icon={Icons.goTo} label={t('Go to passage…')} onPress={open(() => router.push('/passage'))} />
      <MenuItem icon={Icons.fullscreen} label={t('Full screen')} onPress={open(onFullscreen)} />
      <MenuItem icon={Icons.translate} label={t('Change version')} onPress={open(() => router.push('/version-picker'))} />
      {split && (
        <MenuItem
          icon={Icons.split}
          label={t('Change second version')}
          onPress={open(() => router.push({ pathname: '/version-picker', params: { slot: 'split' } }))}
        />
      )}
      <MenuItem icon={Icons.plan} label={t('Reading plans')} onPress={open(() => router.push('/plans'))} />
      <MenuItem icon={Icons.library} label={t('Bookmarks & notes')} onPress={open(() => router.navigate('/library'))} />
      <MenuItem icon={Icons.topic} label={t('Topics')} onPress={open(() => router.navigate('/topics'))} />
      <MenuItem icon={Icons.settings} label={t('Settings')} onPress={open(() => router.navigate('/settings'))} />
    </>
  );
}

function SelectionBar({
  ranges,
  versionId,
  versionName,
  reference,
  bookmarked,
  bottom,
  onDone,
}: {
  ranges: VerseRange[];
  versionId: string;
  versionName: string;
  reference: string;
  bookmarked: boolean;
  bottom: number;
  onDone: () => void;
}) {
  const theme = useTheme();
  const t = useT();
  const single = ranges.length === 1 && ranges[0].ari === ranges[0].ariEnd;

  const text = async () => {
    const parts = await Promise.all(ranges.map((r) => getRange(versionId, r.ari, r.ariEnd)));
    const body = parts
      .flat()
      .map((v) => plainText(v.text))
      .join(' ');
    return `${body}\n— ${reference} (${versionName})`;
  };

  const run = (fn: () => Promise<unknown>, done = true) =>
    fn().then(
      () => done && onDone(),
      showError(t('Something went wrong')),
    );

  return (
    <View style={[styles.bar, { bottom, backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.barHeader}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.fill}>
          {reference}
        </ThemedText>
        <IconButton icon={Icons.close} label={t('Clear selection')} size={18} onPress={onDone} />
      </View>
      <View style={styles.colors}>
        {HighlightColors.map((c, i) => (
          <Pressable
            key={c}
            accessibilityLabel={t('Highlight color {number}', { number: i + 1 })}
            onPress={() => run(() => setHighlight(ranges, i))}
            style={[styles.swatch, { backgroundColor: c, borderColor: theme.border }]}
          />
        ))}
        <Pressable
          accessibilityLabel={t('Remove highlight')}
          onPress={() => run(() => setHighlight(ranges, null))}
          style={[styles.swatch, styles.swatchClear, { borderColor: theme.border }]}>
          <Icon name={Icons.close} size={14} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Action
          icon={bookmarked ? Icons.bookmarkFill : Icons.bookmark}
          label={bookmarked ? t('Unmark') : t('Bookmark')}
          onPress={() => run(() => (bookmarked ? removeBookmarks(ranges) : addBookmarks(ranges, versionId)))}
        />
        <Action
          icon={Icons.note}
          label={t('Note')}
          onPress={() => {
            router.push({ pathname: '/note', params: { ranges: encodeRanges(ranges.slice(0, 1)), version: versionId } });
            onDone();
          }}
        />
        <Action
          icon={Icons.tag}
          label={t('Tag')}
          onPress={() => {
            router.push({ pathname: '/tag-verses', params: { ranges: encodeRanges(ranges) } });
            onDone();
          }}
        />
        <Action
          icon={Icons.copy}
          label={t('Copy')}
          onPress={() => run(async () => Clipboard.setStringAsync(await text()).then(() => toast(t('Copied'))))}
        />
        <Action icon={Icons.share} label={t('Share')} onPress={() => run(async () => share(await text()))} />
        {single && (
          <Action
            icon={Icons.study}
            label={t('Study')}
            onPress={() => {
              router.push({ pathname: '/study', params: { ari: String(ranges[0].ari) } });
              onDone();
            }}
          />
        )}
      </View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: (typeof Icons)[keyof typeof Icons]; label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed, hovered }: Interaction) => [
        styles.action,
        hovered && { backgroundColor: theme.backgroundSelected },
        pressed && { opacity: 0.5 },
      ]}>
      <Icon name={icon} size={22} color={theme.tint} />
      <ThemedText type="small" style={styles.actionLabel}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.6 },
  hovered: { opacity: 0.9 },
  header: {
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSide: { height: HEADER_HEIGHT, justifyContent: 'center' },
  // red tab hanging from the top of the app's area (below the status bar), inside the header
  tab: {
    flexShrink: 1,
    minWidth: 84,
    maxWidth: 180,
    height: HEADER_HEIGHT - Spacing.one,
    marginLeft: Spacing.one,
    paddingHorizontal: Spacing.three - 4,
    justifyContent: 'center',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: 'center',
    boxShadow: '0 3px 6px rgba(0, 0, 0, 0.2)',
  },
  tabVersion: { color: '#ffffff', fontSize: 14, lineHeight: 17, fontWeight: '800', letterSpacing: 0.3 },
  tabPassage: { color: 'rgba(255,255,255,0.88)', fontSize: 11, lineHeight: 14 },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  heading: { fontWeight: '700', textAlign: 'center', marginTop: Spacing.three, marginBottom: Spacing.two },
  verse: { paddingVertical: 2, paddingHorizontal: Spacing.one, borderLeftWidth: 3, borderLeftColor: 'transparent', borderRadius: 4 },
  paragraph: { marginTop: Spacing.two },
  splitRow: {
    paddingVertical: Spacing.two,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginLeft: -3,
  },
  splitColumns: { flexDirection: 'row', gap: GUTTER },
  marks: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 2 },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 12,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  planText: { flex: 1, gap: 2 },
  footnotes: { marginLeft: Spacing.two, marginTop: 2, marginBottom: Spacing.one, paddingLeft: Spacing.two, borderLeftWidth: 2, gap: 2 },
  footnote: { fontStyle: 'italic' },
  noteMarker: { fontWeight: '700', fontStyle: 'normal' },
  notesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    marginBottom: Spacing.two,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  canonNotice: { borderRadius: 10, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, marginBottom: Spacing.two },
  canonText: { fontStyle: 'italic', textAlign: 'center' },
  divider: { position: 'absolute', top: 0, width: GUTTER, alignItems: 'center', pointerEvents: 'box-none' },
  dividerLine: { position: 'absolute', top: 0, bottom: 0, left: GUTTER / 2, width: StyleSheet.hairlineWidth, pointerEvents: 'none' },
  // rotated labels: laid out horizontally (LABEL_LENGTH wide) then turned to run along the line
  sideLabel: {
    position: 'absolute',
    left: GUTTER / 2 - LABEL_LENGTH / 2,
    width: LABEL_LENGTH,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-90deg' }],
  },
  sideLabelChip: {
    maxWidth: LABEL_LENGTH,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sideLabelText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  handleArea: { position: 'absolute', left: 0, width: GUTTER, height: 80, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 10, height: 44, borderRadius: 5, borderWidth: 1.5 },
  optionsPopover: { left: Spacing.three, minWidth: 290 },
  morePopover: { right: Spacing.two },
  themeRow: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  stepperValue: { minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
  bar: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three - 4,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  },
  barHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  colors: { flexDirection: 'row', gap: Spacing.two },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth },
  swatchClear: { alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between' },
  action: { alignItems: 'center', gap: 2, minWidth: 48, paddingVertical: Spacing.one, borderRadius: 10 },
  actionLabel: { fontSize: 11, lineHeight: 14 },
});
