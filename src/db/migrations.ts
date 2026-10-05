/**
 * Schema migrations. Sync needs them from the first release (migrationsEnabledAtVersion: 1),
 * so the server can be asked for the columns/tables added since the device's last pull.
 *
 * Example for schema version 2:
 *   { toVersion: 2, steps: [addColumns({ table: 'notes', columns: [{ name: 'title', type: 'string', isOptional: true }] })] }
 */
import { schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [],
});
