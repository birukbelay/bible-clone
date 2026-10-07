/**
 * Writes to the user database. Everything goes through database.write() so sync sees it.
 * Deletes use markAsDeleted() (not destroyPermanently) so they are pushed to other devices.
 */
import { Q } from '@nozbe/watermelondb';

import { makeAri } from '@/bible/ari';
import type { Book } from '@/bible/queries';
import type { VerseRange } from '@/bible/reference';
import { TagColors } from '@/constants/theme';

import { database } from './index';
import {
  Bookmark,
  Highlight,
  MemoryVerse,
  Note,
  Plan,
  PlanReading,
  Prayer,
  Tag,
  Topic,
  TopicStrong,
  VerseTag,
  type TopicMode,
} from './models';

const bookmarks = () => database.get<Bookmark>('bookmarks');
const notes = () => database.get<Note>('notes');
const highlights = () => database.get<Highlight>('highlights');
const tags = () => database.get<Tag>('tags');
const verseTags = () => database.get<VerseTag>('verse_tags');
const topics = () => database.get<Topic>('topics');
const topicStrongs = () => database.get<TopicStrong>('topic_strongs');
const plans = () => database.get<Plan>('plans');
const planReadings = () => database.get<PlanReading>('plan_readings');
const memoryVerses = () => database.get<MemoryVerse>('memory_verses');
const prayers = () => database.get<Prayer>('prayers');

/** Records whose range overlaps [from, to]. */
export const overlapping = (from: number, to: number) => [Q.where('ari', Q.lte(to)), Q.where('ari_end', Q.gte(from))];

// ---- bookmarks --------------------------------------------------------------------------------

export function addBookmarks(ranges: VerseRange[], versionId: string | null) {
  return database.write(async () => {
    for (const r of ranges) {
      const existing = await bookmarks().query(Q.where('ari', r.ari), Q.where('ari_end', r.ariEnd)).fetchCount();
      if (existing) continue;
      await bookmarks().create((b) => {
        b.ari = r.ari;
        b.ariEnd = r.ariEnd;
        b.versionId = versionId;
        b.title = null;
      });
    }
  });
}

/** Removes bookmarks touching any of the ranges. */
export function removeBookmarks(ranges: VerseRange[]) {
  return database.write(async () => {
    for (const r of ranges) {
      const found = await bookmarks().query(...overlapping(r.ari, r.ariEnd)).fetch();
      await database.batch(...found.map((b) => b.prepareMarkAsDeleted()));
    }
  });
}

export function renameBookmark(bookmark: Bookmark, title: string) {
  return database.write(() => bookmark.update((b) => (b.title = title.trim() || null)));
}

// ---- notes ------------------------------------------------------------------------------------

export function saveNote(note: Note | null, range: VerseRange, body: string, versionId: string | null) {
  return database.write(async () => {
    const text = body.trim();
    if (note) {
      if (!text) await note.markAsDeleted();
      else await note.update((n) => (n.body = text));
      return;
    }
    if (!text) return;
    await notes().create((n) => {
      n.ari = range.ari;
      n.ariEnd = range.ariEnd;
      n.versionId = versionId;
      n.body = text;
    });
  });
}

export function deleteRecord(record: Bookmark | Note | Highlight | VerseTag) {
  return database.write(() => record.markAsDeleted());
}

// ---- highlights (one record per verse) --------------------------------------------------------

export function setHighlight(ranges: VerseRange[], color: number | null) {
  return database.write(async () => {
    const ops = [];
    for (const r of ranges) {
      const old = await highlights().query(...overlapping(r.ari, r.ariEnd)).fetch();
      ops.push(...old.map((h) => h.prepareMarkAsDeleted()));
      if (color != null) {
        ops.push(
          highlights().prepareCreate((h) => {
            h.ari = r.ari;
            h.ariEnd = r.ariEnd;
            h.color = color;
          }),
        );
      }
    }
    await database.batch(...ops);
  });
}

// ---- tags -------------------------------------------------------------------------------------

export async function createTag(name: string, color?: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Tag name is empty');
  const count = await tags().query().fetchCount();
  return database.write(() =>
    tags().create((t) => {
      t.name = clean;
      t.color = color ?? TagColors[count % TagColors.length];
    }),
  );
}

export function updateTag(tag: Tag, name: string, color: string) {
  return database.write(() =>
    tag.update((t) => {
      t.name = name.trim() || t.name;
      t.color = color;
    }),
  );
}

/** Deletes the tag and its verse links. */
export function deleteTag(tag: Tag) {
  return database.write(async () => {
    const links = await tag.verseTags.fetch();
    await database.batch(...links.map((l) => l.prepareMarkAsDeleted()), tag.prepareMarkAsDeleted());
  });
}

export function tagVerses(tagId: string, ranges: VerseRange[]) {
  return database.write(async () => {
    for (const r of ranges) {
      const exists = await verseTags()
        .query(Q.where('tag_id', tagId), Q.where('ari', r.ari), Q.where('ari_end', r.ariEnd))
        .fetchCount();
      if (exists) continue;
      await verseTags().create((vt) => {
        vt.tagId = tagId;
        vt.ari = r.ari;
        vt.ariEnd = r.ariEnd;
      });
    }
  });
}

export function untagVerses(tagId: string, ranges: VerseRange[]) {
  return database.write(async () => {
    for (const r of ranges) {
      const found = await verseTags()
        .query(Q.where('tag_id', tagId), ...overlapping(r.ari, r.ariEnd))
        .fetch();
      await database.batch(...found.map((vt) => vt.prepareMarkAsDeleted()));
    }
  });
}

// ---- topics -----------------------------------------------------------------------------------

export function createTopic(name: string, strongs: string[] = [], description?: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Topic name is empty');
  return database.write(async () => {
    const topic = topics().prepareCreate((t) => {
      t.name = clean;
      t.description = description?.trim() || null;
      t.mode = 'any';
    });
    const words = [...new Set(strongs)].map((s) =>
      topicStrongs().prepareCreate((w) => {
        w.topicId = topic.id;
        w.strong = s;
        w.note = null;
      }),
    );
    await database.batch(topic, ...words);
    return topic;
  });
}

export function updateTopic(topic: Topic, patch: { name?: string; description?: string | null; mode?: TopicMode }) {
  return database.write(() =>
    topic.update((t) => {
      if (patch.name !== undefined) t.name = patch.name.trim() || t.name;
      if (patch.description !== undefined) t.description = patch.description?.trim() || null;
      if (patch.mode !== undefined) t.mode = patch.mode;
    }),
  );
}

export function deleteTopic(topic: Topic) {
  return database.write(async () => {
    const words = await topic.words.fetch();
    await database.batch(...words.map((w) => w.prepareMarkAsDeleted()), topic.prepareMarkAsDeleted());
  });
}

export function addTopicStrongs(topicId: string, strongs: string[]) {
  return database.write(async () => {
    const existing = new Set(
      (await topicStrongs().query(Q.where('topic_id', topicId)).fetch()).map((w) => w.strong),
    );
    const ops = strongs
      .filter((s) => !existing.has(s))
      .map((s) =>
        topicStrongs().prepareCreate((w) => {
          w.topicId = topicId;
          w.strong = s;
          w.note = null;
        }),
      );
    await database.batch(...ops);
  });
}

export function removeTopicStrong(word: TopicStrong) {
  return database.write(() => word.markAsDeleted());
}

// ---- reading plans ----------------------------------------------------------------------------

export type PlanChapter = { book: number; chapter: number };

export type NewPlan = {
  name: string;
  /** in reading order */
  chapters: PlanChapter[];
  chaptersPerDay: number;
  /** any time on day 1 */
  startDate: number;
  reminder: { enabled: boolean; time: string };
};

/** Local midnight of the day containing `time`. */
export function startOfDay(time: number) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Readings of one day: runs of consecutive chapters of the same book ("Mat 1-3", "Mat 28; Mrk 1-2"). */
function dayReadings(chapters: PlanChapter[], books: Book[]) {
  const runs: { book: number; from: number; to: number }[] = [];
  for (const c of chapters) {
    const last = runs.at(-1);
    if (last && last.book === c.book && last.to + 1 === c.chapter) last.to = c.chapter;
    else runs.push({ book: c.book, from: c.chapter, to: c.chapter });
  }
  return runs.map((r) => {
    const name = books.find((b) => b.book === r.book)?.abbr || books.find((b) => b.book === r.book)?.name || `${r.book + 1}`;
    return {
      label: r.from === r.to ? `${name} ${r.from}` : `${name} ${r.from}-${r.to}`,
      ari: makeAri(r.book, r.from, 1),
      ariEnd: makeAri(r.book, r.to, 255),
    };
  });
}

export function createPlan(plan: NewPlan, books: Book[]) {
  const name = plan.name.trim();
  if (!name) throw new Error('Plan name is empty');
  if (!plan.chapters.length) throw new Error('The plan has no chapters');
  const perDay = Math.max(1, Math.round(plan.chaptersPerDay));
  return database.write(async () => {
    const record = plans().prepareCreate((p) => {
      p.name = name;
      p.startDate = startOfDay(plan.startDate);
      p.active = true;
      p.reminderEnabled = plan.reminder.enabled;
      p.reminderTime = plan.reminder.time;
      p.chaptersPerDay = perDay;
    });
    const readings: PlanReading[] = [];
    for (let day = 0; day * perDay < plan.chapters.length; day++) {
      for (const r of dayReadings(plan.chapters.slice(day * perDay, (day + 1) * perDay), books)) {
        const position = readings.length;
        readings.push(
          planReadings().prepareCreate((pr) => {
            pr.planId = record.id;
            pr.position = position;
            pr.day = day;
            pr.label = r.label;
            pr.ari = r.ari;
            pr.ariEnd = r.ariEnd;
            pr.readAt = null;
          }),
        );
      }
    }
    await database.batch(record, ...readings);
    return record;
  });
}

export function updatePlan(
  plan: Plan,
  patch: { name?: string; active?: boolean; reminderEnabled?: boolean; reminderTime?: string; startDate?: number },
) {
  return database.write(() =>
    plan.update((p) => {
      if (patch.name !== undefined) p.name = patch.name.trim() || p.name;
      if (patch.active !== undefined) p.active = patch.active;
      if (patch.reminderEnabled !== undefined) p.reminderEnabled = patch.reminderEnabled;
      if (patch.reminderTime !== undefined) p.reminderTime = patch.reminderTime;
      if (patch.startDate !== undefined) p.startDate = startOfDay(patch.startDate);
    }),
  );
}

export function deletePlan(plan: Plan) {
  return database.write(async () => {
    const readings = await plan.readings.fetch();
    await database.batch(...readings.map((r) => r.prepareMarkAsDeleted()), plan.prepareMarkAsDeleted());
  });
}

/** Marks a reading as read on `readAt` (ms), or not read (null). */
export function setReadOn(reading: PlanReading, readAt: number | null) {
  return database.write(() => reading.update((r) => (r.readAt = readAt)));
}

/** Marks a reading read now, or not read. */
export function setRead(reading: PlanReading, read: boolean) {
  return setReadOn(reading, read ? Date.now() : null);
}

/** Marks every reading of the list as read now (or not read). */
export function setReadAll(readings: PlanReading[], read: boolean) {
  const now = Date.now();
  return database.write(() =>
    database.batch(
      ...readings
        .filter((r) => (r.readAt != null) !== read)
        .map((r) => r.prepareUpdate((x) => (x.readAt = read ? now : null))),
    ),
  );
}

// ---- memory verses ----------------------------------------------------------------------------

/** Days until the next review for each level (Leitner boxes); the last one repeats. */
export const MEMORY_INTERVALS = [1, 2, 4, 7, 14, 30, 60, 120];

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight `days` days after the day of `time` (DST-safe). */
export function addDays(time: number, days: number) {
  return startOfDay(startOfDay(time) + days * DAY + DAY / 2);
}

/** Adds the ranges to the memory verses (due today); ranges already there are kept as they are. */
export function addMemoryVerses(ranges: VerseRange[], versionId: string | null) {
  return database.write(async () => {
    const today = startOfDay(Date.now());
    for (const r of ranges) {
      const existing = await memoryVerses().query(Q.where('ari', r.ari), Q.where('ari_end', r.ariEnd)).fetchCount();
      if (existing) continue;
      await memoryVerses().create((m) => {
        m.ari = r.ari;
        m.ariEnd = r.ariEnd;
        m.versionId = versionId;
        m.level = 0;
        m.nextDue = today;
        m.lastReviewed = null;
      });
    }
  });
}

/** Records a review: remembered moves the verse up one box, forgotten sends it back to the first. */
export function reviewMemoryVerse(verse: MemoryVerse, remembered: boolean) {
  const now = Date.now();
  const level = remembered ? Math.min(verse.level + 1, MEMORY_INTERVALS.length) : 0;
  const days = remembered ? MEMORY_INTERVALS[Math.min(level, MEMORY_INTERVALS.length) - 1] : 1;
  return database.write(() =>
    verse.update((m) => {
      m.level = level;
      m.lastReviewed = now;
      m.nextDue = addDays(now, days);
    }),
  );
}

export function deleteMemoryVerse(verse: MemoryVerse) {
  return database.write(() => verse.markAsDeleted());
}

// ---- prayer list ------------------------------------------------------------------------------

export type PrayerInput = { title: string; body?: string | null; range?: VerseRange | null };

export function savePrayer(prayer: Prayer | null, input: PrayerInput) {
  const title = input.title.trim();
  if (!title) throw new Error('The prayer has no title');
  const body = input.body?.trim() || null;
  const apply = (p: Prayer) => {
    p.title = title;
    p.body = body;
    if (input.range !== undefined) {
      p.ari = input.range?.ari ?? null;
      p.ariEnd = input.range?.ariEnd ?? null;
    }
  };
  return database.write(async () => {
    if (prayer) return prayer.update(apply);
    return prayers().create((p) => {
      p.ari = null;
      p.ariEnd = null;
      p.answeredAt = null;
      apply(p);
    });
  });
}

export function setPrayerAnswered(prayer: Prayer, answered: boolean) {
  return database.write(() => prayer.update((p) => (p.answeredAt = answered ? Date.now() : null)));
}

export function deletePrayer(prayer: Prayer) {
  return database.write(() => prayer.markAsDeleted());
}
