/**
 * Sync plumbing for user data (bookmarks, notes, highlights, tags, topics).
 *
 * WatermelonDB already tracks every local change (_status / _changed columns) and implements
 * the pull -> apply -> push protocol in `synchronize()`. A backend only has to move change sets:
 *
 *   pull({ lastPulledAt, schemaVersion, migration }) -> { changes, timestamp }
 *   push({ changes, lastPulledAt })
 *
 * No backend ships with the app yet. A future one (Google Drive appData file, own server,
 * WebDAV, ...) implements SyncBackend in src/sync/backends/ and is passed to setSyncBackend().
 * See docs/fyn-rn-data.md for the change set format.
 */
import {
  hasUnsyncedChanges,
  synchronize,
  type SyncDatabaseChangeSet,
  type SyncLog,
  type SyncPullArgs,
  type SyncPushArgs,
} from '@nozbe/watermelondb/sync';
import { useSyncExternalStore } from 'react';

import { database } from '@/db';

export type { SyncDatabaseChangeSet, SyncPullArgs, SyncPushArgs };

export interface SyncBackend {
  /** stable id, e.g. 'google-drive' */
  id: string;
  /** shown in settings */
  name: string;
  /** whether the user is signed in / configured; sync is skipped otherwise */
  isReady(): Promise<boolean>;
  /** changes made elsewhere since lastPulledAt (all records when undefined), and the server time */
  pull(args: SyncPullArgs): Promise<{ changes: SyncDatabaseChangeSet; timestamp: number }>;
  /** local changes since the last sync; throw to make the whole sync retry later */
  push(args: SyncPushArgs): Promise<void>;
}

type SyncState = {
  backend: SyncBackend | null;
  running: boolean;
  lastSyncedAt: number | null;
  lastError: string | null;
};

let state: SyncState = { backend: null, running: false, lastSyncedAt: null, lastError: null };
const listeners = new Set<() => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useSyncState() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => state,
    () => state,
  );
}

export function setSyncBackend(backend: SyncBackend | null) {
  setState({ backend, lastError: null });
}

let running: Promise<void> | null = null;

/** Runs one sync with the configured backend. Concurrent calls share the same run. */
export function syncNow() {
  const { backend } = state;
  if (!backend) return Promise.resolve();
  running ??= (async () => {
    setState({ running: true, lastError: null });
    const log: SyncLog = {};
    try {
      if (!(await backend.isReady())) return;
      await synchronize({
        database,
        log,
        migrationsEnabledAtVersion: 1,
        pullChanges: (args) => backend.pull(args),
        pushChanges: (args) => backend.push(args),
      });
      setState({ lastSyncedAt: log.newLastPulledAt ?? Date.now() });
    } catch (e) {
      setState({ lastError: e instanceof Error ? e.message : String(e) });
      console.warn('[sync] failed', e, log);
    } finally {
      setState({ running: false });
      running = null;
    }
  })();
  return running;
}

/** True when there are local changes that were never pushed. */
export function hasLocalChanges() {
  return hasUnsyncedChanges({ database });
}
