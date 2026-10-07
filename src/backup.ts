/**
 * Backup to a JSON file and back, without any server: every user-data table (bookmarks, notes,
 * highlights, tags, topics, plans, memory verses, prayers) as raw WatermelonDB rows, plus the
 * device settings worth keeping (reading progress, history, display and audio options).
 * Also: notes as Markdown / plain text. The format is in docs/fyn-rn-data.md.
 */
import type { Model, TableName } from '@nozbe/watermelondb';

import { getBooks, getVerseMap, type Verse } from '@/bible/queries';
import { formatRef } from '@/bible/reference';
import { plainText } from '@/bible/markup';
import { printPage } from '@/bible/reading';
import { database, type Note, type Plan } from '@/db';
import { schema } from '@/db/schema';
import { cancelNotification, scheduleDaily, syncReminders } from '@/reminders';
import { settings, type Setting } from '@/settings';

export const BACKUP_FORMAT = 1;

/** Settings that travel with a backup (not the reading position or folders, which belong to the device). */
const SETTING_KEYS = [
  'theme',
  'fontSize',
  'lineSpacing',
  'margins',
  'verseLines',
  'fontFamily',
  'redLetters',
  'showStrongs',
  'showNotes',
  'copy',
  'language',
  'calendar',
  'history',
  'searchHistory',
  'ttsRate',
  'ttsVoice',
  'audioRate',
  'audioContinue',
  'audioSources',
  'readChapters',
  'readDays',
  'memoryReminder',
] as const satisfies readonly (keyof typeof settings)[];

export type Backup = {
  app: 'fyn-bible';
  format: number;
  schemaVersion: number;
  exportedAt: number;
  tables: Record<string, Record<string, unknown>[]>;
  settings: Partial<Record<(typeof SETTING_KEYS)[number], unknown>>;
};

const tableNames = () => Object.keys(schema.tables) as TableName<Model>[];

/** Strips WatermelonDB's local sync bookkeeping from a row. */
function cleanRaw(raw: object) {
  const { _status, _changed, ...row } = raw as Record<string, unknown>;
  void _status;
  void _changed;
  return row;
}

export async function createBackup(): Promise<Backup> {
  const tables: Backup['tables'] = {};
  for (const name of tableNames()) {
    const records = await database.get(name).query().fetch();
    tables[name] = records.map((r) => cleanRaw(r._raw));
  }
  const kept: Backup['settings'] = {};
  for (const key of SETTING_KEYS) kept[key] = settings[key].get();
  return { app: 'fyn-bible', format: BACKUP_FORMAT, schemaVersion: schema.version, exportedAt: Date.now(), tables, settings: kept };
}

export const backupFileName = (time = Date.now()) => `fyn-bible-backup-${new Date(time).toISOString().slice(0, 10)}.json`;

/** Parses and checks a backup file; throws with a readable message when it is not one. */
export function parseBackup(text: string): Backup {
  let data: Backup;
  try {
    data = JSON.parse(text) as Backup;
  } catch {
    throw new Error('The file is not a backup (not JSON).');
  }
  if (data?.app !== 'fyn-bible' || typeof data.tables !== 'object' || data.tables == null) throw new Error('The file is not a backup of this app.');
  if (data.format > BACKUP_FORMAT || data.schemaVersion > schema.version)
    throw new Error('The backup was made by a newer version of the app. Update the app first.');
  return data;
}

export function backupCounts(backup: Backup) {
  const count = (name: string) => backup.tables[name]?.length ?? 0;
  return {
    bookmarks: count('bookmarks'),
    notes: count('notes'),
    highlights: count('highlights'),
    tags: count('tags'),
    topics: count('topics'),
    plans: count('plans'),
    memory: count('memory_verses'),
    prayers: count('prayers'),
  };
}

/**
 * Restores a backup. 'replace' deletes the data on this device first; 'merge' only adds the
 * records this device does not have (by id). Returns the number of records added.
 */
export async function restoreBackup(backup: Backup, mode: 'replace' | 'merge') {
  let added = 0;
  await database.write(async () => {
    for (const name of tableNames()) {
      const rows = backup.tables[name] ?? [];
      const collection = database.get(name);
      const existing = await collection.query().fetch();
      const deleted = await database.adapter.getDeletedRecords(name);
      const present = new Set(existing.map((r) => r.id));
      const ops: Model[] = [];
      if (mode === 'replace') {
        ops.push(...existing.map((r) => r.prepareDestroyPermanently()));
        if (deleted.length) await database.adapter.destroyDeletedRecords(name, deleted);
        present.clear();
      } else {
        // a record deleted here but in the backup comes back
        const back = deleted.filter((id) => rows.some((r) => r.id === id));
        if (back.length) await database.adapter.destroyDeletedRecords(name, back);
      }
      for (const row of rows) {
        if (typeof row.id !== 'string' || present.has(row.id)) continue;
        present.add(row.id);
        ops.push(collection.prepareCreateFromDirtyRaw(cleanRaw(row)));
        added++;
      }
      if (ops.length) await database.batch(...ops);
    }
  });

  for (const key of SETTING_KEYS) {
    if (!(key in (backup.settings ?? {}))) continue;
    const value = backup.settings[key];
    if (mode === 'merge' && (key === 'readChapters' || key === 'readDays')) {
      const current = settings[key].get();
      settings[key].set({ ...(value as Record<string, number>), ...current });
    } else if (mode === 'replace' || key === 'audioSources') {
      (settings[key] as Setting<unknown>).set(mode === 'merge' ? { ...(value as object), ...(settings[key].get() as object) } : value);
    }
  }

  // reminders follow the restored plans and settings
  const plans = await database.get<Plan>('plans').query().fetch();
  await syncReminders(plans).catch(() => {});
  const reminder = settings.memoryReminder.get();
  if (reminder.enabled) await scheduleDaily('memory-verses', 'Memory verses', 'Time to review your memory verses', reminder.time).catch(() => {});
  else await cancelNotification('memory-verses').catch(() => {});
  return added;
}

// ---- notes export -----------------------------------------------------------------------------

type ExportedNote = { reference: string; verse: string; body: string; date: number };

async function collectNotes(versionId: string, withVerses: boolean): Promise<ExportedNote[]> {
  const notes = await database.get<Note>('notes').query().fetch();
  notes.sort((a, b) => a.ari - b.ari || a.createdAt.getTime() - b.createdAt.getTime());
  const books = await getBooks(versionId).catch(() => undefined);
  const aris = withVerses ? notes.flatMap((n) => (n.ariEnd - n.ari < 200 ? range(n.ari, n.ariEnd) : [n.ari])) : [];
  const verses = withVerses && aris.length ? await getVerseMap(versionId, aris).catch(() => new Map<number, Verse>()) : new Map<number, Verse>();
  return notes.map((n) => ({
    reference: formatRef(books, n.ari, n.ariEnd),
    // a merged verse answers for several ids: once is enough
    verse: [...new Set((n.ariEnd - n.ari < 200 ? range(n.ari, n.ariEnd) : [n.ari]).map((a) => verses.get(a)))]
      .filter((v): v is Verse => v != null)
      .map((v) => plainText(v.text).trim())
      .join(' '),
    body: n.body,
    date: n.updatedAt.getTime(),
  }));
}

/** Verse ids of a range inside one chapter; ranges across chapters fall back to the first verse. */
function range(ari: number, ariEnd: number) {
  if (ari >> 8 !== ariEnd >> 8) return [ari];
  const out: number[] = [];
  for (let a = ari; a <= ariEnd; a++) out.push(a);
  return out;
}

export async function exportNotes(versionId: string, format: 'md' | 'txt', title: string, withVerses = true) {
  const notes = await collectNotes(versionId, withVerses);
  if (format === 'md') {
    return [
      `# ${title}`,
      '',
      ...notes.flatMap((n) => [`## ${n.reference}`, '', ...(n.verse ? [`> ${n.verse}`, ''] : []), n.body.trim(), '']),
    ].join('\n');
  }
  return [title, '='.repeat(title.length), '', ...notes.flatMap((n) => [n.reference, ...(n.verse ? [`"${n.verse}"`] : []), '', n.body.trim(), '', '---', ''])].join(
    '\n',
  );
}

export async function notesPage(versionId: string, title: string) {
  const notes = await collectNotes(versionId, true);
  return printPage(
    title,
    notes.map((n) => `${n.reference}${n.verse ? `\n“${n.verse}”` : ''}\n\n${n.body.trim()}`),
  );
}

export const notesCount = () => database.get<Note>('notes').query().fetchCount();
