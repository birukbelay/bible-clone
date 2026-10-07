/**
 * Typed references -> aris: "jn 3 16", "John 3:16-18", "1 Cor 13", "ዮሐ 3፡16", "JHN.3.16",
 * "ዮሐንስ ፫፡፲፮". Book names come from the open version (its own names and abbreviations, so any
 * language works) plus the English names, common abbreviations and USFM codes.
 */
import { EXTRA_BOOKS } from './canon';
import { BOOK_COUNT, makeAri } from './ari';
import { fold, type Book } from './queries';

/** USFM book codes by ari book number (0 = GEN; 66.. = the books in canon.ts) */
export const USFM = [
  'GEN', 'EXO', 'LEV', 'NUM', 'DEU', 'JOS', 'JDG', 'RUT', '1SA', '2SA', '1KI', '2KI', '1CH', '2CH', 'EZR', 'NEH',
  'EST', 'JOB', 'PSA', 'PRO', 'ECC', 'SNG', 'ISA', 'JER', 'LAM', 'EZK', 'DAN', 'HOS', 'JOL', 'AMO', 'OBA', 'JON',
  'MIC', 'NAM', 'HAB', 'ZEP', 'HAG', 'ZEC', 'MAL', 'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL',
  'EPH', 'PHP', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE', '1JN', '2JN', '3JN',
  'JUD', 'REV',
  // 66..
  '1ES', '2ES', 'TOB', 'JDT', 'ESG', '1MA', '2MA', '3MA', 'SIR', 'MAN', 'LJE', 'SUS', 'BAR', 'WIS', 'S3Y', 'BEL',
  'JUB', 'ENO', '4MA', 'PS2', 'ODA', 'PSS', 'DAG', '1MQ', '2MQ', '3MQ', '4BA', 'LAO',
];

const ENGLISH = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah', 'Esther', 'Job', 'Psalms', 'Proverbs',
  'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah', 'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel',
  'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts', 'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians',
  'Philippians', 'Colossians', '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon',
  'Hebrews', 'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation',
];

/** other spellings people type */
const ALIASES: Record<string, number> = {
  psalm: 18, ps: 18, pss: 18, songofsongs: 21, canticles: 21, sos: 21, qoheleth: 20, revelations: 65,
  jn: 42, jhn: 42, mt: 39, mk: 40, lk: 41, rm: 44, ro: 44, ex: 1, dt: 4, jdg: 6, jg: 6, pr: 19, prv: 19,
  ec: 20, is: 22, je: 23, ek: 25, eze: 25, dn: 26, ho: 27, ob: 30, na: 33, hb: 34, zp: 35, hg: 36, zc: 37,
  ml: 38, ac: 43, ga: 47, php: 49, phl: 49, cl: 50, phm: 56, phlm: 56, hbr: 57, jas: 58, jm: 58, jd: 64, rv: 65,
  rev: 65, apocalypse: 65,
};

/** Ethiopic numerals (፩ ... ፲ ... ፻) -> digits, so "፫፡፲፮" reads as 3:16. */
function geezNumbers(s: string) {
  return s.replace(/[፩-፼]+/g, (m) => {
    let total = 0;
    let current = 0;
    for (const ch of m) {
      const c = ch.codePointAt(0)!;
      if (c <= 0x1371) current += c - 0x1368;
      else if (c <= 0x137a) current += (c - 0x1371) * 10;
      else if (c === 0x137b) {
        total += (current || 1) * 100;
        current = 0;
      } else {
        total = (total + current || 1) * 10000;
        current = 0;
      }
    }
    return String(total + current);
  });
}

/** comparison key: folded, without spaces and punctuation; "1ኛ" -> "1" */
const key = (s: string) =>
  fold(s)
    .replace(/(\d)\s*ኛ/g, '$1')
    .replace(/[^\p{L}\p{N}]/gu, '');

type Candidate = { book: number; key: string };

const cache = new WeakMap<Book[], Candidate[]>();
let englishOnly: Candidate[] | null = null;

function candidates(books: Book[] | undefined): Candidate[] {
  if (books && cache.has(books)) return cache.get(books)!;
  if (!books && englishOnly) return englishOnly;
  const list: Candidate[] = [];
  const add = (book: number, name: string | undefined) => {
    const k = name ? key(name) : '';
    if (k) list.push({ book, key: k });
  };
  for (const b of books ?? []) {
    add(b.book, b.name);
    add(b.book, b.abbr);
  }
  const has = (book: number) => !books?.length || books.some((b) => b.book === book);
  ENGLISH.forEach((name, book) => add(book, name));
  for (const [book, e] of Object.entries(EXTRA_BOOKS)) {
    if (!has(Number(book))) continue;
    add(Number(book), e.name);
    add(Number(book), e.abbr);
  }
  USFM.forEach((code, book) => has(book) && add(book, code));
  for (const [alias, book] of Object.entries(ALIASES)) add(book, alias);
  if (books) cache.set(books, list);
  else englishOnly = list;
  return list;
}

/** letters of `short` appear in order in `long`, starting with the same character */
function subsequence(short: string, long: string) {
  if (short[0] !== long[0]) return false;
  let i = 0;
  for (const ch of long) if (ch === short[i]) i++;
  return i >= short.length;
}

/** Book number for a typed name, or null. Exact names win over prefixes, prefixes over abbreviations. */
export function matchBook(name: string, books?: Book[]) {
  const k = key(name);
  if (!k || !/\p{L}/u.test(k)) return null;
  const list = candidates(books);
  const rank = (c: Candidate) => {
    if (c.key === k) return 0;
    if (c.key.startsWith(k)) return 1;
    if (k.length >= 2 && subsequence(k, c.key)) return 2;
    return 3;
  };
  let best: { book: number; rank: number } | null = null;
  for (const c of list) {
    const r = rank(c);
    if (r === 3) continue;
    // ties: the book that comes first in the Bible
    if (!best || r < best.rank || (r === best.rank && order(c.book) < order(best.book))) best = { book: c.book, rank: r };
  }
  return best?.book ?? null;
}

const order = (book: number) => (book < BOOK_COUNT ? book : book + 1000);

export type ParsedRef = {
  book: number;
  chapter: number;
  /** 0 = the whole chapter */
  verse: number;
  verseEnd: number;
  /** first verse (verse 1 for a whole chapter) */
  ari: number;
  ariEnd: number;
};

const REF = /^(.*?\p{L}[^\d]*?)\s*(\d+)?(?:\s*[:.,\s]\s*(\d+)(?:\s*[-–]\s*(\d+))?)?\s*$/u;

/**
 * Parses "John 3:16", "jn 3 16", "1 Cor 13", "JHN.3.16-18", "ዮሐ 3፡16", "ዮሐንስ ፫". Null when the text is
 * not a reference or the book / chapter is not in `books` (when given).
 */
export function parseRef(input: string, books?: Book[]): ParsedRef | null {
  const text = geezNumbers(input.trim())
    .replace(/[፡፥፦]/g, ':')
    .replace(/\s+/g, ' ');
  const m = REF.exec(text);
  if (!m) return null;
  const book = matchBook(m[1].replace(/[.:]+$/, ''), books);
  if (book == null) return null;
  const info = books?.find((b) => b.book === book);
  if (books?.length && !info) return null;
  // "PSA.3" / "Ps:3": the only number after a separator is the chapter, not a verse
  const [chapterText, verseText, endText] = m[2] || !m[3] ? [m[2], m[3], m[4]] : [m[3], undefined, undefined];
  let chapter = chapterText ? Number(chapterText) : 1;
  let verse = verseText ? Number(verseText) : 0;
  let verseEnd = endText ? Number(endText) : verse;
  // one-chapter books: "Jude 5" is verse 5
  if (info?.chapters === 1 && chapterText && !verseText && chapter > 1) {
    verse = verseEnd = chapter;
    chapter = 1;
  }
  if (chapter < 1 || chapter > 255 || verse > 255 || verseEnd > 255) return null;
  if (info && chapter > info.chapters) return null;
  if (verseEnd < verse) verseEnd = verse;
  return {
    book,
    chapter,
    verse,
    verseEnd,
    ari: makeAri(book, chapter, verse || 1),
    ariEnd: makeAri(book, chapter, verse ? verseEnd : 255),
  };
}

/** "JHN.3.16" / "JHN.3.16-18" / "JHN.3": the form used in links (see docs/fyn-rn-data.md). */
export function linkRef(ari: number, ariEnd = ari) {
  const book = USFM[(ari >> 16) & 255] ?? String(((ari >> 16) & 255) + 1);
  const chapter = (ari >> 8) & 255;
  const verse = ari & 255;
  const end = ariEnd & 255;
  const sameChapter = ari >> 8 === ariEnd >> 8;
  return `${book}.${chapter}${verse ? `.${verse}` : ''}${verse && sameChapter && end > verse && end < 255 ? `-${end}` : ''}`;
}
