/** Per-verse view of the user's data for one chapter (highlights, bookmarks, notes, tags). */
import { Q } from '@nozbe/watermelondb';

import { chapterRange } from '@/bible/ari';

import { database } from './index';
import { useQuery } from './hooks';
import type { Bookmark, Highlight, Note, Tag, VerseTag } from './models';

export type VerseMarks = {
  highlight?: number;
  bookmark?: boolean;
  noteIds?: string[];
  tagColors?: string[];
};

const inChapter = (from: number, to: number) => Q.where('ari', Q.between(from, to));

export function useChapterMarks(chapterAri: number) {
  const [from, to] = chapterRange(chapterAri);
  const highlights = useQuery(() => database.get<Highlight>('highlights').query(inChapter(from, to)), [from], ['color', 'ari_end']);
  const bookmarks = useQuery(() => database.get<Bookmark>('bookmarks').query(inChapter(from, to)), [from], ['ari_end']);
  const notes = useQuery(() => database.get<Note>('notes').query(inChapter(from, to)), [from], ['ari_end']);
  const verseTags = useQuery(() => database.get<VerseTag>('verse_tags').query(inChapter(from, to)), [from], ['ari_end']);
  const tags = useQuery(() => database.get<Tag>('tags').query(), [], ['color']);

  const marks = new Map<number, VerseMarks>();
  const each = (ari: number, ariEnd: number, fn: (m: VerseMarks) => void) => {
    for (let a = ari; a <= Math.min(ariEnd, to); a++) {
      let m = marks.get(a);
      if (!m) marks.set(a, (m = {}));
      fn(m);
    }
  };
  highlights?.forEach((h) => each(h.ari, h.ariEnd, (m) => (m.highlight = h.color)));
  bookmarks?.forEach((b) => each(b.ari, b.ariEnd, (m) => (m.bookmark = true)));
  notes?.forEach((n) => each(n.ari, n.ariEnd, (m) => (m.noteIds = [...(m.noteIds ?? []), n.id])));
  const tagColor = new Map(tags?.map((t) => [t.id, t.color]));
  verseTags?.forEach((vt) => {
    const color = tagColor.get(vt.tagId);
    if (color) each(vt.ari, vt.ariEnd, (m) => (m.tagColors = [...new Set([...(m.tagColors ?? []), color])]));
  });
  return marks;
}

/** Marks of a (possibly merged) verse: the union over its range. */
export function marksOf(marks: Map<number, VerseMarks>, ari: number, ariEnd: number): VerseMarks {
  if (ariEnd <= ari) return marks.get(ari) ?? {};
  const out: VerseMarks = {};
  for (let a = ari; a <= ariEnd; a++) {
    const m = marks.get(a);
    if (!m) continue;
    out.highlight ??= m.highlight;
    out.bookmark ||= m.bookmark;
    if (m.noteIds) out.noteIds = [...new Set([...(out.noteIds ?? []), ...m.noteIds])];
    if (m.tagColors) out.tagColors = [...new Set([...(out.tagColors ?? []), ...m.tagColors])];
  }
  return out;
}
