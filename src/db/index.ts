import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { migrations } from './migrations';
import { modelClasses } from './models';
import { schema } from './schema';

const adapter = new SQLiteAdapter({
  dbName: 'userdata',
  schema,
  migrations,
  // falls back to the (slower) bridge with a console warning if the JSI module isn't available
  jsi: true,
  onSetUpError: (error) => {
    console.error('[db] failed to open user database', error);
  },
});

export const database = new Database({ adapter, modelClasses });

export * from './models';
