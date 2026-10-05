/**
 * Reading queries against one Bible version DB (see versions.ts), plus a small hook to run them.
 */
import { useEffect, useState } from 'react';

import { bookOf, chapterRange } from './ari';
import { bibleDb } from './versions';

export type Book = { book: number; name: string; abbr: string; chapters: number };
export type Verse = { ari: number; ari_end: number; label: string; text: string; para: number };
export type Extra = { ari: number; kind: 'title' | 'note'; text: string };

const booksCache = new Map<string, Promise<Book[]>>();

export function getBooks(versionId: string) {
  const cached = booksCache.get(versionId);
  if (cached) return cached;
  const books: Promise<Book[]> = bibleDb(versionId).then((db) =>
    db.getAllAsync<Book>('SELECT book, name, abbr, chapters FROM books ORDER BY book'),
  );
  booksCache.set(versionId, books);
  books.catch(() => booksCache.delete(versionId));
  return books;
}

/** Forget cached book lists, e.g. after a version file was replaced. */
export function clearBooksCache(versionId?: string) {
  if (versionId) booksCache.delete(versionId);
  else booksCache.clear();
}

export async function getChapter(versionId: string, ari: number) {
  const db = await bibleDb(versionId);
  const [from, to] = chapterRange(ari);
  const [verses, extras] = await Promise.all([
    db.getAllAsync<Verse>('SELECT ari, ari_end, label, text, para FROM verses WHERE ari BETWEEN ? AND ? ORDER BY ari', from, to),
    db.getAllAsync<Extra>('SELECT ari, kind, text FROM extras WHERE ari BETWEEN ? AND ? ORDER BY rowid', from, to),
  ]);
  return { verses, extras };
}

/**
 * Verses by ari, in the given order. Verses merged in this version ("2-3") are found by
 * any ari inside their range; aris the version doesn't have are skipped.
 */
export async function getVerses(versionId: string, aris: number[]) {
  const found = await getVerseMap(versionId, aris);
  const seen = new Set<number>();
  const result: Verse[] = [];
  for (const a of aris) {
    const v = found.get(a);
    if (v && !seen.has(v.ari)) {
      seen.add(v.ari);
      result.push(v);
    }
  }
  return result;
}

/** Requested ari -> the verse containing it (a merged verse may be the value of several keys). */
export async function getVerseMap(versionId: string, aris: number[]) {
  const found = new Map<number, Verse>();
  if (!aris.length) return found;
  const db = await bibleDb(versionId);
  for (let i = 0; i < aris.length; i += 500) {
    const chunk = aris.slice(i, i + 500);
    const rows = await db.getAllAsync<Verse>(
      `SELECT ari, ari_end, label, text, para FROM verses WHERE ari IN (${chunk.map(() => '?').join(',')})`,
      chunk,
    );
    rows.forEach((r) => found.set(r.ari, r));
  }
  const missing = [...new Set(aris)].filter((a) => !found.has(a));
  for (const a of missing.slice(0, 200)) {
    const row = await db.getFirstAsync<Verse>(
      'SELECT ari, ari_end, label, text, para FROM verses WHERE ari < ? AND ari_end >= ? ORDER BY ari DESC LIMIT 1',
      a,
      a,
    );
    if (row) found.set(a, row);
  }
  return found;
}

/** Verses of a reference range (bookmark / note / cross reference), at most one chapter span. */
export async function getRange(versionId: string, ari: number, ariEnd = ari) {
  const db = await bibleDb(versionId);
  return db.getAllAsync<Verse>(
    'SELECT ari, ari_end, label, text, para FROM verses WHERE ari_end >= ? AND ari <= ? ORDER BY ari',
    ari,
    Math.max(ari, ariEnd),
  );
}

export type SearchScope = 'all' | 'ot' | 'nt' | { book: number };

/**
 * Full-text search. Words are matched as prefixes ("love" finds "loved"); "quoted text" is a phrase.
 */
export async function searchText(versionId: string, query: string, scope: SearchScope = 'all', limit = 300) {
  const match = toFtsQuery(query);
  if (!match) return [];
  const db = await bibleDb(versionId);
  const [from, to] =
    scope === 'all' ? [0, 0xffffff] : scope === 'ot' ? [0, 0x26ffff] : scope === 'nt' ? [0x270000, 0xffffff] : [scope.book << 16, (scope.book << 16) | 0xffff];
  return db.getAllAsync<Verse>(
    `SELECT v.ari, v.ari_end, v.label, v.text, v.para
     FROM verses_fts f JOIN verses v ON v.ari = f.rowid
     WHERE verses_fts MATCH ? AND f.rowid BETWEEN ? AND ?
     ORDER BY v.ari LIMIT ?`,
    match,
    from,
    to,
    limit,
  );
}

function toFtsQuery(input: string) {
  const parts: string[] = [];
  for (const m of input.matchAll(/"([^"]+)"|(\S+)/g)) {
    if (m[1]) {
      const words = m[1].replace(/["*]/g, ' ').trim();
      if (words) parts.push(`"${words}"`);
    } else {
      // strip FTS syntax characters, keep letters of any script
      const word = m[2].replace(/[^\p{L}\p{N}\p{M}']/gu, '');
      if (word) parts.push(`"${word}"*`);
    }
  }
  return parts.join(' ');
}

/** Book name lookup for references ("John 3:16") in lists. */
export function bookName(books: Book[] | undefined, ari: number, short = false) {
  const b = books?.find((x) => x.book === bookOf(ari));
  return b ? (short ? b.abbr : b.name) : `#${bookOf(ari) + 1}`;
}

/**
 * Runs an async loader when its deps change; keeps the previous data while reloading.
 * Results of outdated calls are dropped.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true });
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    load().then(
      (data) => live && setState({ data, loading: false }),
      (error: Error) => live && setState({ error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
