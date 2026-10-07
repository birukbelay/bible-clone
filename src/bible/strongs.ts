/**
 * Strong's dictionary, Strong's -> verse index and cross references (assets/db/strongs.db).
 * The verse index comes from the tagged KJV, so it works for every version with KJV
 * versification: look verses up by ari, then show their text from the current version.
 */
import { normalizeStrong } from './markup';
import { strongsDb } from './versions';

export type StrongEntry = {
  number: string;
  lemma: string | null;
  xlit: string | null;
  pronounce: string | null;
  description: string | null;
  usage: string | null;
  /** number of verses containing the word */
  verses: number;
  occurrences: number;
};

export type StrongVerse = {
  ari: number;
  /** how many of the requested numbers occur in the verse */
  words: number;
  /** total tagged occurrences of the requested numbers */
  hits: number;
  /** the requested numbers found in the verse, comma separated ("G4678,H2451") */
  strongs: string;
};

export type CrossReference = { ari: number; ariEnd: number; weight: number };

const ENTRY_COLUMNS = 'number, lemma, xlit, pronounce, description, usage, verses, occurrences';

export async function getStrong(number: string) {
  const db = await strongsDb();
  return db.getFirstAsync<StrongEntry>(`SELECT ${ENTRY_COLUMNS} FROM strongs WHERE number = ?`, number);
}

export async function getStrongs(numbers: string[]) {
  if (!numbers.length) return [];
  const db = await strongsDb();
  const rows = await db.getAllAsync<StrongEntry>(
    `SELECT ${ENTRY_COLUMNS} FROM strongs WHERE number IN (${numbers.map(() => '?').join(',')})`,
    numbers,
  );
  const byNumber = new Map(rows.map((r) => [r.number, r]));
  return numbers.map((n) => byNumber.get(n)).filter((r): r is StrongEntry => !!r);
}

/**
 * "G4678" / "4678" -> that entry first; otherwise matches the transliteration, lemma,
 * and the KJV usage ("wisdom" finds G4678, H2451, ...), most frequent words first.
 */
export async function searchStrongs(query: string, limit = 50) {
  const q = query.trim();
  if (!q) return [];
  const db = await strongsDb();
  const results: StrongEntry[] = [];
  const number = normalizeStrong(q);
  if (number) {
    const prefix = /^[GHgh]/.test(q) ? [number] : [`G${number.slice(1)}`, `H${number.slice(1)}`];
    results.push(...(await getStrongs(prefix)));
  }
  if (!/^\s*[GHgh]?\s*\d+\s*$/.test(q)) {
    // lower(): the web build of SQLite compares LIKE case-sensitively
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await db.getAllAsync<StrongEntry>(
      `SELECT ${ENTRY_COLUMNS} FROM strongs
       WHERE lower(xlit) LIKE ?1 ESCAPE '\\' OR lower(lemma) LIKE ?1 ESCAPE '\\' OR lower(usage) LIKE ?1 ESCAPE '\\'
       ORDER BY (lower(xlit) LIKE ?2 ESCAPE '\\') DESC, verses DESC
       LIMIT ?3`,
      like,
      `${like.slice(1)}`,
      limit,
    );
    results.push(...rows.filter((r) => !results.some((x) => x.number === r.number)));
  }
  return results;
}

/**
 * Verses containing the given Strong's numbers.
 * mode 'any': at least one of them, verses with more of the words first;
 * mode 'all': every one of them.
 */
export async function versesForStrongs(numbers: string[], mode: 'any' | 'all' = 'any') {
  const unique = [...new Set(numbers)];
  if (!unique.length) return [];
  const db = await strongsDb();
  const marks = unique.map(() => '?').join(',');
  const having = mode === 'all' ? `HAVING count(*) = ${unique.length}` : '';
  return db.getAllAsync<StrongVerse>(
    `SELECT ari, count(*) AS words, sum(cnt) AS hits, group_concat(strong) AS strongs FROM strongs_verse
     WHERE strong IN (${marks}) GROUP BY ari ${having}
     ORDER BY words DESC, ari`,
    unique,
  );
}

/** Strong's numbers that occur in a verse (from the index, so it also works for untagged versions). */
export async function strongsOfVerse(ari: number) {
  const db = await strongsDb();
  return db.getAllAsync<StrongEntry & { cnt: number }>(
    `SELECT s.number, s.lemma, s.xlit, s.pronounce, s.description, s.usage, s.verses, s.occurrences, v.cnt
     FROM strongs_verse v JOIN strongs s ON s.number = v.strong
     WHERE v.ari = ? ORDER BY s.number`,
    ari,
  );
}

/** Cross references of a verse, strongest first. */
export async function crossReferences(ari: number, limit = 50) {
  const db = await strongsDb();
  // the index is on from_end; a reference spans at most a few verses, so bound it to the chapter
  const rows = await db.getAllAsync<{ to_start: number; to_end: number; weight: number }>(
    `SELECT to_start, to_end, weight FROM xref
     WHERE from_end BETWEEN ? AND ? AND from_start <= ?
     ORDER BY weight DESC LIMIT ?`,
    ari,
    ari | 255,
    ari,
    limit,
  );
  return rows.map<CrossReference>((r) => ({ ari: r.to_start, ariEnd: r.to_end || r.to_start, weight: r.weight }));
}
