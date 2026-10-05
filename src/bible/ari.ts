/**
 * Verse key used everywhere (bible DBs, strongs.db, user data):
 * ari = (book << 16) | (chapter << 8) | verse, book 0..65 (0 = Genesis, 39 = Matthew).
 * Verse 0 is used as "start of chapter" for range queries.
 */

export const BOOK_COUNT = 66;
export const NT_START = 39;

export function makeAri(book: number, chapter: number, verse: number) {
  return ((book & 255) << 16) | ((chapter & 255) << 8) | (verse & 255);
}

export const bookOf = (ari: number) => (ari >> 16) & 255;
export const chapterOf = (ari: number) => (ari >> 8) & 255;
export const verseOf = (ari: number) => ari & 255;

/** First and last possible ari of a chapter, for BETWEEN queries. */
export function chapterRange(ari: number): [number, number] {
  const base = ari & ~255;
  return [base, base | 255];
}

export function isSameChapter(a: number, b: number) {
  return a >> 8 === b >> 8;
}

/** "3:16" or "3:16-18" (verse range inside one chapter). */
export function chapterVerse(ari: number, ariEnd?: number) {
  const end = ariEnd && ariEnd !== ari && isSameChapter(ari, ariEnd) ? `-${verseOf(ariEnd)}` : '';
  return `${chapterOf(ari)}:${verseOf(ari)}${end}`;
}
