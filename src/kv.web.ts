/**
 * Synchronous key-value storage for settings on the web: localStorage. (expo-sqlite's kv-store
 * would block the page on a worker for every read.) Missing during static rendering.
 */
const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);

export const kv = {
  get: (key: string): string | null => storage()?.getItem(key) ?? null,
  set: (key: string, value: string) => {
    try {
      storage()?.setItem(key, value);
    } catch {
      // private mode / quota: keep the value in memory only
    }
  },
};
