/**
 * Reading queries against one Bible version DB (see versions.ts), plus a small hook to run them.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { bookOf, chapterRange } from './ari';
import { EXTRA_BOOKS, sectionRange, type Section } from './canon';
import { foldGeez, hasGeez, isVariantLetter } from './geez';
import { plainText } from './markup';
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
  if (versionId) {
    booksCache.delete(versionId);
    foldedIndex.delete(versionId);
  } else {
    booksCache.clear();
    foldedIndex.clear();
  }
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

export type SearchScope = 'all' | Section | { book: number };

/**
 * Full-text search. Words are matched as prefixes ("love" finds "loved"); "quoted text" is a phrase.
 * Ge'ez spelling variants match each other (ሀ ሐ ኀ, ሰ ሠ, ...; see geez.ts).
 */
export async function searchText(versionId: string, query: string, scope: SearchScope = 'all', limit = 300) {
  const [from, to] =
    scope === 'all' ? [0, 0xffffff] : typeof scope === 'string' ? sectionRange(scope) : [scope.book << 16, (scope.book << 16) | 0xffff];
  if (Platform.OS === 'web') return scanText(versionId, query, from, to, limit);
  // files built before the Ge'ez folding: their index has the letters as written
  if (hasGeez(query) && !(await hasFoldedIndex(versionId))) return scanText(versionId, query, from, to, limit);
  const match = toFtsQuery(query);
  if (!match) return [];
  const db = await bibleDb(versionId);
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

const foldedIndex = new Map<string, Promise<boolean>>();

/** Whether the file's full-text index has Ge'ez variants folded (info.search_fold = 'geez', see build_bible_db.py). */
function hasFoldedIndex(versionId: string) {
  let known = foldedIndex.get(versionId);
  if (!known) {
    known = bibleDb(versionId)
      .then((db) => db.getFirstAsync<{ value: string }>("SELECT value FROM info WHERE key = 'search_fold'"))
      .then((row) => row?.value === 'geez', () => false);
    foldedIndex.set(versionId, known);
  }
  return known;
}

function toFtsQuery(input: string) {
  const parts: string[] = [];
  for (const m of foldGeez(input).matchAll(/"([^"]+)"|(\S+)/g)) {
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

/** Lower case without accents, like the FTS tokenizer (unicode61 remove_diacritics), Ge'ez variants folded. */
export const fold = (s: string) => foldGeez(s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase());
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOT_WORD = '[^\\p{L}\\p{N}]';

/**
 * Search without a full-text index (the browser's SQLite has no FTS5, older files have no Ge'ez
 * folding), same rules as searchText:
 * SQLite narrows the verses down with LIKE on the longest word, the rest is matched here.
 */
async function scanText(versionId: string, query: string, from: number, to: number, limit: number) {
  const tests: RegExp[] = [];
  const words: string[] = [];
  for (const m of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const parts = fold(m[1] ?? m[2])
      .split(/[^\p{L}\p{N}']+/u)
      .map((w) => w.replace(/^'+|'+$/g, ''))
      .filter(Boolean);
    if (!parts.length) continue;
    words.push(...parts);
    // phrase: the words in a row; single word: a prefix ("love" finds "loved")
    const body = parts.map(escapeRegex).join(`${NOT_WORD}+`);
    tests.push(new RegExp(`(?<![\\p{L}\\p{N}])${body}${m[1] ? `(?![\\p{L}\\p{N}])` : ''}`, 'u'));
  }
  if (!tests.length) return [];
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  // a Ge'ez letter with spelling variants may be any of them in the text: '_' matches one letter
  const like = `%${[...longest.replace(/[\\%_]/g, '\\$&')].map((ch) => (isVariantLetter(ch) ? '_' : ch)).join('')}%`;

  const db = await bibleDb(versionId);
  const results: Verse[] = [];
  let after = from - 1;
  while (results.length < limit) {
    const rows = await db.getAllAsync<Verse>(
      `SELECT ari, ari_end, label, text, para FROM verses
       WHERE ari > ? AND ari <= ? AND lower(text) LIKE ? ESCAPE '\\' ORDER BY ari LIMIT 2000`,
      after,
      to,
      like,
    );
    for (const v of rows) {
      const plain = fold(plainText(v.text));
      if (tests.every((t) => t.test(plain))) results.push(v);
      if (results.length >= limit) break;
    }
    if (rows.length < 2000) break;
    after = rows[rows.length - 1].ari;
  }
  return results;
}

/** Book name lookup for references ("John 3:16") in lists. */
export function bookName(books: Book[] | undefined, ari: number, short = false) {
  const b = books?.find((x) => x.book === bookOf(ari));
  if (b) return short ? b.abbr : b.name;
  const extra = EXTRA_BOOKS[bookOf(ari)];
  return extra ? (short ? extra.abbr : extra.name) : `#${bookOf(ari) + 1}`;
}

/**
 * Runs an async loader when its deps change; keeps the previous data while reloading.
 * Results of outdated calls are dropped.
 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): { data?: T; error?: Error; loading: boolean } {
  // `deps` of the last result: loading until it matches the current ones
  const [state, setState] = useState<{ data?: T; error?: Error; deps?: readonly unknown[] }>({});
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setState({ data, deps }),
      (error: Error) => live && setState({ error, deps }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  const loading = !state.deps || state.deps.length !== deps.length || state.deps.some((d, i) => !Object.is(d, deps[i]));
  return { data: state.data, error: state.error, loading };
}
