/** Web: same schema and models, stored in IndexedDB through LokiJS (src/db/index.ts is the native SQLite one). */
import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';

import { migrations } from './migrations';
import { modelClasses } from './models';
import { schema } from './schema';

const adapter = new LokiJSAdapter({
  dbName: 'userdata',
  schema,
  migrations,
  useWebWorker: false,
  useIncrementalIndexedDB: true,
  onSetUpError: (error) => {
    console.error('[db] failed to open user database', error);
  },
  onQuotaExceededError: (error) => {
    console.error('[db] browser storage is full', error);
  },
  extraIncrementalIDBOptions: {
    // another tab wrote the same data; reload so this tab does not overwrite it with stale records
    onversionchange: () => window.location.reload(),
  },
});

export const database = new Database({ adapter, modelClasses });

export * from './models';
