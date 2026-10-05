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

export const schema = appSchema({
  version: 1,
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
  ],
});
