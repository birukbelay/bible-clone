/**
 * Writes to the user database. Everything goes through database.write() so sync sees it.
 * Deletes use markAsDeleted() (not destroyPermanently) so they are pushed to other devices.
 */
import { Q } from '@nozbe/watermelondb';

import type { VerseRange } from '@/bible/reference';
import { TagColors } from '@/constants/theme';

import { database } from './index';
import { Bookmark, Highlight, Note, Tag, Topic, TopicStrong, VerseTag, type TopicMode } from './models';

const bookmarks = () => database.get<Bookmark>('bookmarks');
const notes = () => database.get<Note>('notes');
const highlights = () => database.get<Highlight>('highlights');
const tags = () => database.get<Tag>('tags');
const verseTags = () => database.get<VerseTag>('verse_tags');
const topics = () => database.get<Topic>('topics');
const topicStrongs = () => database.get<TopicStrong>('topic_strongs');

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
