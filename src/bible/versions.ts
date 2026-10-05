/**
 * Bible versions: read-only SQLite files (format in docs/fyn-rn-data.md), one per version.
 *
 *   <SQLite dir>/strongs.db        shared Strong's dictionary + verse index + cross references
 *   <SQLite dir>/bibles/<id>.db    one file per version; the file name must match info.id
 *
 * Bundled versions are copied out of the app on first launch (and again when the asset changes
 * in an app update). More versions come from a catalog JSON (any static file host) or from a
 * .db file picked on the device - no accounts or third-party services involved.
 */
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import {
  defaultDatabaseDirectory,
  importDatabaseFromAssetAsync,
  openDatabaseAsync,
  type SQLiteDatabase,
} from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { settings } from '@/settings';

export const FORMAT = 1;

const BUNDLED: Record<string, number> = {
  AMH1954: require('@/assets/db/AMH1954.db'),
  KJV: require('@/assets/db/KJV.db'),
};
const STRONGS_ASSET: number = require('@/assets/db/strongs.db');

/** Directories as expo-sqlite sees them (plain paths)... */
const SQLITE_PATH: string = defaultDatabaseDirectory;
const BIBLES_PATH = `${SQLITE_PATH}/bibles`;
/** ...and as expo-file-system sees them. defaultDatabaseDirectory is <documents>/SQLite on iOS and Android. */
const sqliteDir = () => new Directory(Paths.document, 'SQLite');
const biblesDir = () => new Directory(Paths.document, 'SQLite', 'bibles');

export type BibleVersion = {
  id: string;
  name: string;
  shortName: string;
  locale: string;
  version: string;
  fonts: string;
  /** verse text carries inline Strong's tags (@[G25@]) */
  strongs: boolean;
  builtAt: number;
  bundled: boolean;
};

// ---- connections ------------------------------------------------------------------------------

const connections = new Map<string, Promise<SQLiteDatabase>>();

function openFile(dir: string, name: string) {
  const key = `${dir}/${name}`;
  const cached = connections.get(key);
  if (cached) return cached;
  const db: Promise<SQLiteDatabase> = openDatabaseAsync(name, {}, dir);
  connections.set(key, db);
  db.catch(() => connections.delete(key));
  return db;
}

async function closeFile(dir: string, name: string) {
  const key = `${dir}/${name}`;
  const db = connections.get(key);
  connections.delete(key);
  if (db) await db.then((d) => d.closeAsync()).catch(() => {});
}

export const bibleDb = (versionId: string) => openFile(BIBLES_PATH, `${versionId}.db`);
export const strongsDb = () => openFile(SQLITE_PATH, 'strongs.db');

async function readInfo(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string | null }>('SELECT key, value FROM info');
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])) as Record<string, string | undefined>;
}

function toVersion(info: Record<string, string | undefined>): BibleVersion | null {
  if (!info.id || !info.name || Number(info.format) !== FORMAT) return null;
  return {
    id: info.id,
    name: info.name,
    shortName: info.short_name || info.id,
    locale: info.locale || 'en',
    version: info.version ?? '',
    fonts: info.fonts || 'default',
    strongs: info.strongs === '1',
    builtAt: Number(info.built_at) || 0,
    bundled: info.id in BUNDLED,
  };
}

// ---- store ------------------------------------------------------------------------------------

type VersionsState = {
  ready: boolean;
  versions: BibleVersion[];
  /** in-progress downloads: id -> progress 0..1, or -1 when the size is unknown */
  downloads: Record<string, number>;
};

let state: VersionsState = { ready: false, versions: [], downloads: {} };
const listeners = new Set<() => void>();
const aborts = new Map<string, AbortController>();

function setState(patch: Partial<VersionsState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useVersions() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function getVersion(id: string) {
  return state.versions.find((v) => v.id === id);
}

/** The reader's version (falls back to the first installed one). */
export function useCurrentVersion() {
  const { versions } = useVersions();
  const id = useSyncExternalStore(settings.version.subscribe, settings.version.get, settings.version.get);
  return versions.find((v) => v.id === id) ?? versions[0];
}

/** The split view's second version: the chosen one, else the first installed one that differs from the reader's. */
export function useSplitVersion() {
  const { versions } = useVersions();
  const current = useSyncExternalStore(settings.version.subscribe, settings.version.get, settings.version.get);
  const id = useSyncExternalStore(settings.splitVersion.subscribe, settings.splitVersion.get, settings.splitVersion.get);
  return versions.find((v) => v.id === id) ?? versions.find((v) => v.id !== current) ?? versions[0];
}

// ---- setup ------------------------------------------------------------------------------------

async function importBundled(dir: string, directory: Directory, name: string, assetId: number) {
  const hash = Asset.fromModule(assetId).hash ?? String(assetId);
  const known = settings.bundledHashes.get();
  if (known[name] === hash && new File(directory, name).exists) return;
  await closeFile(dir, name);
  // forceOverwrite only when the app shipped a different file; a missing file is always copied
  await importDatabaseFromAssetAsync(name, { assetId, forceOverwrite: known[name] !== hash }, dir);
  settings.bundledHashes.set({ ...settings.bundledHashes.get(), [name]: hash });
}

let setupPromise: Promise<void> | null = null;

/** Copies bundled DBs if needed and loads the version list. Safe to call more than once. */
export function setupBibles() {
  setupPromise ??= (async () => {
    biblesDir().create({ intermediates: true, idempotent: true });
    await importBundled(SQLITE_PATH, sqliteDir(), 'strongs.db', STRONGS_ASSET);
    for (const [id, asset] of Object.entries(BUNDLED)) {
      await importBundled(BIBLES_PATH, biblesDir(), `${id}.db`, asset);
    }
    await refreshVersions();
  })().catch((e) => {
    setupPromise = null;
    throw e;
  });
  return setupPromise;
}

export async function refreshVersions() {
  const files = biblesDir()
    .list()
    .filter((f): f is File => f instanceof File && f.name.endsWith('.db'));
  const versions: BibleVersion[] = [];
  for (const file of files) {
    try {
      const v = toVersion(await readInfo(await openFile(BIBLES_PATH, file.name)));
      if (v && file.name === `${v.id}.db`) versions.push(v);
      else console.warn(`[versions] ignoring ${file.name}: bad info table`);
    } catch (e) {
      console.warn(`[versions] cannot open ${file.name}`, e);
    }
  }
  versions.sort((a, b) => Number(b.bundled) - Number(a.bundled) || a.name.localeCompare(b.name));
  setState({ ready: true, versions });
  if (versions.length && !versions.some((v) => v.id === settings.version.get())) {
    settings.version.set(versions[0].id);
  }
}

// ---- install / download / delete --------------------------------------------------------------

/**
 * Validates a downloaded or picked .db and installs it as bibles/<info.id>.db,
 * replacing an older copy of the same version.
 */
export async function installFile(source: File, expectedId?: string) {
  const tmpName = `incoming-${Date.now()}.tmp`; // not *.db, so never listed as a version
  const tmp = new File(biblesDir(), tmpName);
  await source.copy(tmp);
  let version: BibleVersion | null = null;
  try {
    const db = await openDatabaseAsync(tmpName, { useNewConnection: true }, BIBLES_PATH);
    try {
      version = toVersion(await readInfo(db));
      const verse = await db.getFirstAsync('SELECT ari FROM verses LIMIT 1');
      const book = await db.getFirstAsync('SELECT book FROM books LIMIT 1');
      if (!verse || !book) version = null;
    } finally {
      await db.closeAsync();
    }
  } catch {
    version = null;
  }
  if (!version || (expectedId && version.id !== expectedId)) {
    deleteFiles(tmpName);
    throw new Error(
      version ? `Expected version ${expectedId}, got ${version.id}` : `Not a Bible database (format ${FORMAT})`,
    );
  }
  const name = `${version.id}.db`;
  await closeFile(BIBLES_PATH, name);
  deleteFiles(name);
  await tmp.move(new File(biblesDir(), name));
  await refreshVersions();
  return version;
}

function deleteFiles(name: string) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const f = new File(biblesDir(), name + suffix);
    if (f.exists) f.delete();
  }
}

/** Lets the user pick a .db file (shared from a computer, messaging app, ...). */
export async function importFromDevice() {
  const picked = await File.pickFileAsync({ mimeTypes: ['application/octet-stream', 'application/x-sqlite3', '*/*'] });
  if (picked.canceled || !picked.result) return null;
  return installFile(picked.result);
}

export async function deleteVersion(id: string) {
  const version = getVersion(id);
  if (version?.bundled) throw new Error('Bundled versions cannot be removed');
  const name = `${id}.db`;
  await closeFile(BIBLES_PATH, name);
  deleteFiles(name);
  await refreshVersions();
}

/** Entry of the versions catalog JSON, see docs/fyn-rn-data.md. */
export type CatalogEntry = {
  id: string;
  name: string;
  short_name?: string;
  locale?: string;
  strongs?: boolean;
  /** absolute, or relative to the catalog URL */
  url: string;
  /** bytes */
  size?: number;
  built_at?: number;
  description?: string;
};

function resolveUrl(url: string, base: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (url.startsWith('/')) return (/^[a-z]+:\/\/[^/]+/i.exec(base)?.[0] ?? '') + url;
  return base.replace(/[^/]*([?#].*)?$/, '') + url;
}

export async function fetchCatalog(url: string): Promise<CatalogEntry[]> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Catalog: HTTP ${res.status}`);
  const json: unknown = await res.json();
  const list = Array.isArray(json) ? json : (json as { versions?: unknown })?.versions;
  if (!Array.isArray(list)) throw new Error('Catalog: expected a "versions" list');
  return list
    .filter((e): e is CatalogEntry => typeof e?.id === 'string' && typeof e?.url === 'string')
    .map((e) => ({ ...e, name: e.name || e.id, url: resolveUrl(e.url, url) }));
}

export async function downloadVersion(entry: CatalogEntry) {
  if (aborts.has(entry.id)) return;
  const controller = new AbortController();
  aborts.set(entry.id, controller);
  const setProgress = (p: number) => setState({ downloads: { ...state.downloads, [entry.id]: p } });
  setProgress(0);
  const part = new File(Paths.cache, `${entry.id}.db.part`);
  try {
    await File.downloadFileAsync(entry.url, part, {
      idempotent: true,
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        const total = totalBytes > 0 ? totalBytes : (entry.size ?? 0);
        setProgress(total > 0 ? Math.min(1, bytesWritten / total) : -1);
      },
    });
    return await installFile(part, entry.id);
  } finally {
    aborts.delete(entry.id);
    const { [entry.id]: _, ...rest } = state.downloads;
    setState({ downloads: rest });
    if (part.exists) part.delete();
  }
}

export function cancelDownload(id: string) {
  aborts.get(id)?.abort();
}
