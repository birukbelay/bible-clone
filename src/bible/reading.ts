/**
 * Reader bookkeeping kept on the device (src/settings.ts, not synced): the chapters opened, with
 * back / forward like a browser; chapters read and days with reading (progress, streaks); and
 * the text Copy / Share build from the selection.
 */
import { settings, type CopyOptions } from '@/settings';

import { BOOK_COUNT, chapterOf, makeAri, verseOf } from './ari';
import { kjvChapters } from './canon';
import { plainText } from './markup';
import type { Verse } from './queries';

// ---- history ----------------------------------------------------------------------------------

const HISTORY_SIZE = 100;

/** Records a chapter opened in the reader (not when moving with back / forward). */
export function recordVisit(chapterAri: number) {
  const { items, index } = settings.history.get();
  const at = index < 0 ? items.length - 1 : index;
  if (items[at] === chapterAri) return;
  const kept = items.slice(0, at + 1).filter((a) => a !== chapterAri);
  const next = [...kept, chapterAri].slice(-HISTORY_SIZE);
  settings.history.set({ items: next, index: next.length - 1 });
}

type History = ReturnType<typeof settings.history.get>;

export const canGoBack = ({ items, index }: History) => (index < 0 ? items.length - 1 : index) > 0;

export const canGoForward = ({ items, index }: History) => index >= 0 && index < items.length - 1;

/** Moves through the history; returns the chapter to open, or null at either end. */
export function historyStep(delta: 1 | -1) {
  const { items, index } = settings.history.get();
  const at = (index < 0 ? items.length - 1 : index) + delta;
  if (at < 0 || at >= items.length) return null;
  settings.history.set({ items, index: at });
  return items[at];
}

export function clearHistory() {
  settings.history.set({ items: [], index: -1 });
}

// ---- progress ---------------------------------------------------------------------------------

/** 'YYYY-MM-DD' of a local date */
export function dayKey(time = Date.now()) {
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Marks a chapter as read (once per day counts toward the day). */
export function markChapterRead(chapterAri: number, time = Date.now()) {
  const key = String(chapterAri & ~255);
  const chapters = settings.readChapters.get();
  const last = chapters[key];
  settings.readChapters.set({ ...chapters, [key]: time });
  if (last && dayKey(last) === dayKey(time)) return;
  const days = settings.readDays.get();
  const day = dayKey(time);
  settings.readDays.set({ ...days, [day]: (days[day] ?? 0) + 1 });
}

export function unmarkChapterRead(chapterAri: number) {
  const { [String(chapterAri & ~255)]: _, ...rest } = settings.readChapters.get();
  settings.readChapters.set(rest);
}

/** Days in a row with reading, ending today (or yesterday, when today has none yet). */
export function readingStreak(days: Record<string, number>, now = Date.now()) {
  let count = 0;
  const d = new Date(now);
  if (!days[dayKey(d.getTime())]) d.setDate(d.getDate() - 1);
  while (days[dayKey(d.getTime())]) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

export function longestStreak(days: Record<string, number>) {
  const keys = Object.keys(days)
    .filter((k) => days[k] > 0)
    .sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const k of keys) {
    const [y, m, d] = k.split('-').map(Number);
    const time = new Date(y, m - 1, d, 12).getTime();
    run = prev != null && Math.round((time - prev) / 86_400_000) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = time;
  }
  return best;
}

/** Chapters of the 66 books read, per book (counts by the KJV chapter numbers). */
export function bookProgress(chapters: Record<string, number>) {
  const read = new Map<number, number>();
  for (const key of Object.keys(chapters)) {
    const ari = Number(key);
    const book = ari >> 16;
    if (book >= BOOK_COUNT || chapterOf(ari) > kjvChapters(book)) continue;
    read.set(book, (read.get(book) ?? 0) + 1);
  }
  return Array.from({ length: BOOK_COUNT }, (_, book) => ({ book, read: read.get(book) ?? 0, total: kjvChapters(book) }));
}

export const isChapterRead = (chapters: Record<string, number>, chapterAri: number) => String(chapterAri & ~255) in chapters;

/** First verse of each chapter of a book that is read */
export const chapterKey = (book: number, chapter: number) => makeAri(book, chapter, 0);

// ---- copy / share text ------------------------------------------------------------------------

/** Verse text with the reference as set in Settings > Copy and share. */
export function formatVerses(verses: Verse[], reference: string, versionName: string, options: CopyOptions = settings.copy.get()) {
  const many = verses.length > 1;
  const parts = verses.map((v) => {
    const text = plainText(v.text).trim();
    const label = v.label || String(verseOf(v.ari));
    return options.numbers && many ? `${label} ${text}` : text;
  });
  const body = parts.join(options.lines ? '\n' : ' ');
  if (options.reference === 'none') return body;
  const name = options.version && versionName ? versionName : '';
  const ref =
    options.style === 'parens'
      ? `(${reference}${name ? ` ${name}` : ''})`
      : options.style === 'plain'
        ? `${reference}${name ? ` ${name}` : ''}`
        : `— ${reference}${name ? ` (${name})` : ''}`;
  return options.reference === 'before' ? `${ref}\n${body}` : `${body}\n${ref}`;
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Printable page (print dialog / PDF) of verses: a title and paragraphs of text. */
export function printPage(title: string, paragraphs: string[], footer = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:Georgia,'Noto Serif Ethiopic','Abyssinica SIL',serif;margin:40px;line-height:1.6;font-size:15px;color:#111}
h1{font-size:22px;margin:0 0 16px}p{margin:0 0 10px}footer{margin-top:24px;color:#666;font-size:12px}</style></head>
<body><h1>${escapeHtml(title)}</h1>${paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')}${
    footer ? `<footer>${escapeHtml(footer)}</footer>` : ''
  }</body></html>`;
}
