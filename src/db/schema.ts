/**
 * User data, synced later through WatermelonDB sync (src/sync). Verses are referenced by ari,
 * which is the same in every version with KJV versification, so notes/tags/highlights show up
 * in whichever version is being read. version_id only records where something was written.
 *
 * Every table has created_at/updated_at (set by WatermelonDB) - sync uses its own _status /
 * _changed columns, these are for display and conflict tie-breaking on the server.
 *
 * Changing the schema: bump version AND add a step to migrations.ts (sync depends on migrations).
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

const timestamps = [
  { name: 'created_at', type: 'number' as const },
  { name: 'updated_at', type: 'number' as const },
];

/** Reading plans (schema version 2). Shared with migrations.ts. */
export const planTables = [
  tableSchema({
    name: 'plans',
    columns: [
      { name: 'name', type: 'string' },
      /** local midnight of day 1, ms */
      { name: 'start_date', type: 'number' },
      /** shown in the reader and reminded; finished or paused plans are inactive */
      { name: 'active', type: 'boolean' },
      { name: 'reminder_enabled', type: 'boolean' },
      /** "HH:MM", local time */
      { name: 'reminder_time', type: 'string' },
      { name: 'chapters_per_day', type: 'number' },
      ...timestamps,
    ],
  }),
  tableSchema({
    name: 'plan_readings',
    columns: [
      { name: 'plan_id', type: 'string', isIndexed: true },
      /** order inside the plan */
      { name: 'position', type: 'number' },
      /** 0 = the start date */
      { name: 'day', type: 'number' },
      /** "Mat 1-3" */
      { name: 'label', type: 'string' },
      /** first verse of the first chapter .. last verse of the last chapter */
      { name: 'ari', type: 'number' },
      { name: 'ari_end', type: 'number' },
      /** when it was read, ms; null = not read yet */
      { name: 'read_at', type: 'number', isOptional: true },
      ...timestamps,
    ],
  }),
];

/** Memory verses and the prayer list (schema version 3). Shared with migrations.ts. */
export const memoryPrayerTables = [
  tableSchema({
    name: 'memory_verses',
    columns: [
      { name: 'ari', type: 'number', isIndexed: true },
      { name: 'ari_end', type: 'number' },
      /** version the verse is learned in; null = the version open in the reader */
      { name: 'version_id', type: 'string', isOptional: true },
      /** 0 = new; every remembered review moves it up one box (see src/memory.ts) */
      { name: 'level', type: 'number' },
      /** next review, local midnight in ms */
      { name: 'next_due', type: 'number' },
      { name: 'last_reviewed', type: 'number', isOptional: true },
      ...timestamps,
    ],
  }),
  tableSchema({
    name: 'prayers',
    columns: [
      { name: 'title', type: 'string' },
      { name: 'body', type: 'string', isOptional: true },
      /** optional verse the prayer rests on */
      { name: 'ari', type: 'number', isOptional: true },
      { name: 'ari_end', type: 'number', isOptional: true },
      /** ms; null = still praying */
      { name: 'answered_at', type: 'number', isOptional: true },
      ...timestamps,
    ],
  }),
];

export const schema = appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'bookmarks',
      columns: [
        { name: 'ari', type: 'number', isIndexed: true },
        { name: 'ari_end', type: 'number' },
        { name: 'version_id', type: 'string', isOptional: true },
        { name: 'title', type: 'string', isOptional: true },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'notes',
      columns: [
        { name: 'ari', type: 'number', isIndexed: true },
        { name: 'ari_end', type: 'number' },
        { name: 'version_id', type: 'string', isOptional: true },
        { name: 'body', type: 'string' },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'highlights',
      columns: [
        { name: 'ari', type: 'number', isIndexed: true },
        { name: 'ari_end', type: 'number' },
        /** index into HighlightColors */
        { name: 'color', type: 'number' },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'tags',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'color', type: 'string' },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'verse_tags',
      columns: [
        { name: 'tag_id', type: 'string', isIndexed: true },
        { name: 'ari', type: 'number', isIndexed: true },
        { name: 'ari_end', type: 'number' },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'topics',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        /** 'any' = verses with at least one of the words, 'all' = verses with every word */
        { name: 'mode', type: 'string' },
        ...timestamps,
      ],
    }),
    tableSchema({
      name: 'topic_strongs',
      columns: [
        { name: 'topic_id', type: 'string', isIndexed: true },
        /** "G4678", "H2451" */
        { name: 'strong', type: 'string', isIndexed: true },
        { name: 'note', type: 'string', isOptional: true },
        ...timestamps,
      ],
    }),
    ...planTables,
    ...memoryPrayerTables,
  ],
});
