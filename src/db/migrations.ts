/**
 * Schema migrations. Sync needs them from the first release (migrationsEnabledAtVersion: 1),
 * so the server can be asked for the columns/tables added since the device's last pull.
 *
 * Example for schema version 2:
 *   { toVersion: 2, steps: [addColumns({ table: 'notes', columns: [{ name: 'title', type: 'string', isOptional: true }] })] }
 */
import { createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

import { memoryPrayerTables, planTables } from './schema';

export const migrations = schemaMigrations({
  migrations: [
    // reading plans. If the plan tables change later, first copy their version-2 columns here.
    {
      toVersion: 2,
      steps: planTables.map((t) => createTable({ name: t.name, columns: t.columnArray })),
    },
    // memory verses and prayer list. Same rule: freeze their version-3 columns here before changing them.
    {
      toVersion: 3,
      steps: memoryPrayerTables.map((t) => createTable({ name: t.name, columns: t.columnArray })),
    },
  ],
});
