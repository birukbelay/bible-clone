/**
 * Daily readings on the Ethiopian calendar: every day of the Ethiopian year has a psalm, two Old
 * Testament chapters, a Gospel chapter and a chapter of Acts to Revelation, so a year reads most of
 * the Old Testament, the Gospels four times and the rest of the New Testament once and a half.
 * Feasts (the fixed ones by Ethiopian date, Genna on 7 January, the movable ones from the
 * Orthodox Easter) have their own readings instead, with the day's psalm.
 *
 * This is the app's own reading cycle arranged on the church year, not the official lectionary
 * (ግጻዌ) of the Ethiopian Orthodox Tewahedo Church, which needs data the app does not ship.
 */
import { toEthiopian } from '@/calendar';

import { BOOK_COUNT, makeAri, NT_START } from './ari';
import { kjvChapters } from './canon';

export type Reading = { book: number; chapter: number; kind: 'psalm' | 'ot' | 'gospel' | 'apostle' | 'feast' };

export type DayReadings = { feast: string | null; readings: Reading[] };

const PSALMS = 18;
const ACTS = 43;

function chaptersOf(books: number[]) {
  return books.flatMap((book) => Array.from({ length: kjvChapters(book) }, (_, i) => ({ book, chapter: i + 1 })));
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

let lists: { ot: { book: number; chapter: number }[]; gospels: { book: number; chapter: number }[]; apostle: { book: number; chapter: number }[] } | undefined;

function cycle() {
  lists ??= {
    ot: chaptersOf(range(0, NT_START).filter((b) => b !== PSALMS)),
    gospels: chaptersOf(range(NT_START, ACTS)),
    apostle: chaptersOf(range(ACTS, BOOK_COUNT)),
  };
  return lists;
}

/** Day of the Ethiopian year, 0 = Meskerem 1. */
function dayOfYear(time: number) {
  const e = toEthiopian(time);
  return (e.month - 1) * 30 + e.day - 1;
}

/** Orthodox Easter (Fasika) of a Gregorian year, local noon, valid 1900-2099. */
export function orthodoxEaster(year: number) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  // Julian -> Gregorian: 13 days in 1900-2099
  return new Date(year, month - 1, day + 13, 12).getTime();
}

const ch = (book: number, chapter: number): Reading => ({ book, chapter, kind: 'feast' });

/** Fixed feasts: Ethiopian "month-day" -> name and readings. */
const FIXED: Record<string, { name: string; readings: Reading[] }> = {
  '1-1': { name: 'Enkutatash (New Year)', readings: [ch(22, 61), ch(41, 4)] },
  '1-17': { name: 'Meskel (Finding of the Cross)', readings: [ch(45, 1), ch(42, 12)] },
  '5-11': { name: 'Timket (Epiphany)', readings: [ch(22, 12), ch(39, 3), ch(42, 1)] },
  '7-29': { name: 'Annunciation', readings: [ch(22, 7), ch(41, 1)] },
  '12-13': { name: 'Debre Tabor (Transfiguration)', readings: [ch(39, 17), ch(60, 1)] },
  '12-16': { name: 'Filseta (Assumption)', readings: [ch(18, 45), ch(41, 1)] },
};

const GENNA = { name: 'Genna (Nativity)', readings: [ch(22, 9), ch(39, 2), ch(41, 2)] };

/** Movable feasts: days from Easter -> name and readings. */
const MOVABLE: Record<number, { name: string; readings: Reading[] }> = {
  [-7]: { name: 'Hosanna (Palm Sunday)', readings: [ch(37, 9), ch(39, 21), ch(42, 12)] },
  [-2]: { name: 'Siklet (Good Friday)', readings: [ch(22, 53), ch(18, 22), ch(42, 19)] },
  0: { name: 'Fasika (Easter)', readings: [ch(45, 15), ch(39, 28), ch(42, 20)] },
  39: { name: 'Erget (Ascension)', readings: [ch(43, 1), ch(41, 24)] },
  49: { name: 'Pentecost', readings: [ch(43, 2), ch(42, 14)] },
};

const DAY = 86_400_000;

export function readingsFor(time: number): DayReadings {
  const e = toEthiopian(time);
  const noon = new Date(time);
  noon.setHours(12, 0, 0, 0);
  const fromEaster = Math.round((noon.getTime() - orthodoxEaster(noon.getFullYear())) / DAY);
  // Genna (Tahsas 28 or 29) is always 7 January
  const feast = MOVABLE[fromEaster] ?? (noon.getMonth() === 0 && noon.getDate() === 7 ? GENNA : FIXED[`${e.month}-${e.day}`]) ?? null;

  const { ot, gospels, apostle } = cycle();
  const d = dayOfYear(time);
  const daily: Reading[] = [
    { book: PSALMS, chapter: (d % kjvChapters(PSALMS)) + 1, kind: 'psalm' },
    { ...ot[(d * 2) % ot.length], kind: 'ot' },
    { ...ot[(d * 2 + 1) % ot.length], kind: 'ot' },
    { ...gospels[d % gospels.length], kind: 'gospel' },
    { ...apostle[d % apostle.length], kind: 'apostle' },
  ];
  return { feast: feast?.name ?? null, readings: feast ? [...feast.readings, ...daily.filter((r) => r.kind === 'psalm')] : daily };
}

export const readingAri = (r: Reading) => makeAri(r.book, r.chapter, 1);
