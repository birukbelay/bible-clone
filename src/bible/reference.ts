/** Reference formatting and verse-range helpers shared by screens. */
import { router } from 'expo-router';

import { settings } from '@/settings';

import { bookOf, chapterOf, isSameChapter, makeAri, verseOf } from './ari';
import { bookName, type Book } from './queries';

/** Inclusive verse range [ari, ariEnd]; ariEnd = ari for a single verse. */
export type VerseRange = { ari: number; ariEnd: number };

/** "John 3:16", "John 3:16-18", "John 3:16-4:2" */
export function formatRef(books: Book[] | undefined, ari: number, ariEnd = ari, short = false): string {
  const start = `${bookName(books, ari, short)} ${chapterOf(ari)}:${verseOf(ari)}`;
  if (!ariEnd || ariEnd <= ari) return start;
  if (isSameChapter(ari, ariEnd)) return `${start}-${verseOf(ariEnd)}`;
  if (bookOf(ari) === bookOf(ariEnd)) return `${start}-${chapterOf(ariEnd)}:${verseOf(ariEnd)}`;
  return `${start} - ${formatRef(books, ariEnd, ariEnd, short)}`;
}

/** "John 3" */
export function bookChapterTitle(books: Book[] | undefined, ari: number) {
  return books ? `${bookName(books, ari)} ${chapterOf(ari)}` : '';
}

/** Route param form of ranges: "2753296-2753298,2753300-2753300". */
export function encodeRanges(ranges: VerseRange[]) {
  return ranges.map((r) => `${r.ari}-${r.ariEnd}`).join(',');
}

export function decodeRanges(param: string | string[] | undefined): VerseRange[] {
  const value = Array.isArray(param) ? param[0] : param;
  if (!value) return [];
  return value
    .split(',')
    .map((part) => {
      const [a, b] = part.split('-').map(Number);
      return { ari: a, ariEnd: Number.isFinite(b) && b >= a ? b : a };
    })
    .filter((r) => Number.isFinite(r.ari) && r.ari > 0);
}

/**
 * Selected verses of a chapter -> ranges. `chapter` is the chapter's verse list in order;
 * selected verses that are next to each other in it are joined into one range.
 */
export function selectionToRanges(selected: Set<number>, chapter: VerseRange[]) {
  const ranges: VerseRange[] = [];
  let open: VerseRange | null = null;
  for (const v of chapter) {
    if (!selected.has(v.ari)) {
      open = null;
      continue;
    }
    if (open) open.ariEnd = v.ariEnd;
    else ranges.push((open = { ari: v.ari, ariEnd: v.ariEnd }));
  }
  return ranges;
}

/** First verse of the previous / next chapter (crossing books), or null at either end. */
export function adjacentChapter(books: Book[] | undefined, ari: number, delta: 1 | -1) {
  if (!books?.length) return null;
  const index = books.findIndex((b) => b.book === bookOf(ari));
  if (index < 0) return null;
  const chapter = chapterOf(ari) + delta;
  if (chapter >= 1 && chapter <= books[index].chapters) return makeAri(bookOf(ari), chapter, 1);
  const next = books[index + delta];
  if (!next) return null;
  return makeAri(next.book, delta > 0 ? 1 : next.chapters, 1);
}

/** Shows a verse in the reader tab, closing screens opened on top of the tabs. */
export function openInReader(ari: number) {
  settings.position.set(ari);
  router.dismissTo('/');
}
