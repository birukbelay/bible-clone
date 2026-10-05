/** Synchronous key-value storage for settings: expo-sqlite's kv-store on iOS / Android. */
import Storage from 'expo-sqlite/kv-store';

export const kv = {
  get: (key: string): string | null => Storage.getItemSync(key),
  set: (key: string, value: string) => Storage.setItemSync(key, value),
};
