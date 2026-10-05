/**
 * Scrolling list of verse references with their text in the current version.
 * Text is loaded page by page, so it works for thousands of results (topics, Strong's words).
 */
import { useState, type ReactElement, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { formatRef, openInReader, type VerseRange } from '@/bible/reference';
import { getBooks, getVerseMap, useAsync, type Verse } from '@/bible/queries';
import { useCurrentVersion } from '@/bible/versions';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { settings, useSetting } from '@/settings';

import { ThemedText } from './themed-text';
import { Empty, longPress, type Interaction } from './ui';
import { VerseText } from './verse-text';

const PAGE = 60;
/** longest range whose text is shown in full */
const MAX_RANGE = 40;

export type VerseListItem = VerseRange & { key: string };

export function VerseList({
  items,
  header,
  empty,
  emphasize,
  renderExtra,
  onLongPress,
  bottomInset = 0,
}: {
  items: VerseListItem[] | undefined;
  header?: ReactElement;
  empty?: ReactNode;
  emphasize?: ReadonlySet<string>;
  /** shown under the verse text (note body, tags, ...) */
  renderExtra?: (item: VerseListItem) => ReactNode;
  onLongPress?: (item: VerseListItem) => void;
  bottomInset?: number;
}) {
  const theme = useTheme();
  const version = useCurrentVersion();
  const [fontSize] = useSetting(settings.fontSize);
  const [redLetters] = useSetting(settings.redLetters);
  const [limit, setLimit] = usePageLimit(items);
  const versionId = version?.id ?? '';

  const shown = items?.slice(0, limit) ?? [];
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { data: texts } = useAsync(async () => {
    const aris: number[] = [];
    for (const it of shown) {
      for (let a = it.ari; a <= Math.min(it.ariEnd, it.ari + MAX_RANGE); a++) aris.push(a);
    }
    return getVerseMap(versionId, aris);
  }, [versionId, items, limit]);

  const textOf = (it: VerseListItem) => {
    if (!texts) return null;
    const parts: Verse[] = [];
    for (let a = it.ari; a <= Math.min(it.ariEnd, it.ari + MAX_RANGE); a++) {
      const v = texts.get(a);
      if (v && !parts.includes(v)) parts.push(v);
    }
    return parts;
  };

  return (
    <FlatList
      data={shown}
      keyExtractor={(it) => it.key}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ paddingBottom: bottomInset }}
      ListHeaderComponent={header}
      ListEmptyComponent={items ? <View>{empty ?? <Empty title="No verses" />}</View> : null}
      onEndReachedThreshold={0.6}
      onEndReached={() => items && limit < items.length && setLimit(limit + PAGE)}
      renderItem={({ item }) => {
        const verses = textOf(item);
        return (
          <Pressable
            onPress={() => openInReader(item.ari)}
            {...longPress(onLongPress ? () => onLongPress(item) : undefined)}
            style={({ pressed, hovered }: Interaction) => [
              styles.item,
              { borderBottomColor: theme.border },
              (pressed || hovered) && { backgroundColor: theme.backgroundElement },
            ]}>
            <ThemedText type="smallBold" themeColor="tint">
              {formatRef(books, item.ari, item.ariEnd)}
            </ThemedText>
            {verses == null ? null : verses.length ? (
              verses.map((v) => (
                <VerseText
                  key={v.ari}
                  text={v.text}
                  label={verses.length > 1 ? v.label : undefined}
                  fontSize={Math.max(14, fontSize - 3)}
                  redLetters={redLetters}
                  emphasize={emphasize}
                />
              ))
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Not in {version?.shortName ?? 'this version'}
              </ThemedText>
            )}
            {renderExtra?.(item)}
          </Pressable>
        );
      }}
    />
  );
}

/** Number of items to render; back to one page whenever the list itself changes. */
function usePageLimit(items: unknown): [number, (n: number) => void] {
  const [state, setState] = useState({ items, limit: PAGE });
  if (state.items !== items) setState({ items, limit: PAGE });
  const limit = state.items === items ? state.limit : PAGE;
  return [limit, (n) => setState({ items, limit: n })];
}

export function VerseListHeader({ children }: { children: ReactNode }) {
  return <View style={styles.header}>{children}</View>;
}

const styles = StyleSheet.create({
  item: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three - 4,
    gap: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  header: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.three },
});
