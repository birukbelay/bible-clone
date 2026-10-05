/**
 * Device-local preferences (not synced): current version, reading position, display options.
 * Stored in expo-sqlite's key-value store; synced user data lives in WatermelonDB (src/db).
 */
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

export type Setting<T> = {
  get(): T;
  /** `notify: false` stores the value without re-rendering subscribers (e.g. scroll position) */
  set(value: T, notify?: boolean): void;
  subscribe(listener: () => void): () => void;
};

function createSetting<T>(key: string, fallback: T): Setting<T> {
  const listeners = new Set<() => void>();
  let value = fallback;
  try {
    const raw = Storage.getItemSync(key);
    if (raw != null) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  return {
    get: () => value,
    set(next, notify = true) {
      value = next;
      Storage.setItemSync(key, JSON.stringify(next));
      if (notify) listeners.forEach((l) => l());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useSetting<T>(setting: Setting<T>): [T, (value: T) => void] {
  const value = useSyncExternalStore(setting.subscribe, setting.get, setting.get);
  return [value, (v: T) => setting.set(v)];
}

export const settings = {
  /** id of the Bible version shown in the reader (info.id of its .db) */
  version: createSetting('reader.version', 'AMH1954'),
  /** ari of the last read verse (Genesis 1:1) */
  position: createSetting('reader.position', 0x000101),
  /** app colors: follow the phone, or always light / dark */
  theme: createSetting<'system' | 'light' | 'dark'>('app.theme', 'system'),
  fontSize: createSetting('reader.fontSize', 19),
  /** show Strong's numbers after tagged words (versions with strongs = 1) */
  showStrongs: createSetting('reader.showStrongs', false),
  redLetters: createSetting('reader.redLetters', true),
  /** show a second version next to the first one */
  split: createSetting('reader.split', false),
  /** id of the version in the right column of the split view */
  splitVersion: createSetting('reader.splitVersion', 'KJV'),
  /** width of the left column in the split view, 0..1 */
  splitRatio: createSetting('reader.splitRatio', 0.5),
  /** auto-scroll speed (play button), multiple of the base speed */
  scrollSpeed: createSetting('reader.scrollSpeed', 1),
  /** URL of a versions catalog JSON (see docs/fyn-rn-data.md); empty = none */
  catalogUrl: createSetting('versions.catalogUrl', ''),
  /** asset hash of each bundled .db that was copied to the bibles folder */
  bundledHashes: createSetting<Record<string, string>>('versions.bundledHashes', {}),
};
