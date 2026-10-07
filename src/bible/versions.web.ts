/**
 * Bible versions on the web: same exports as versions.ts, different storage.
 *
 *   /bibles/index.json                bundled versions + strongs.db (written by scripts/build-web-dbs.mjs)
 *   /bibles/<id>.<hash>.db.gz         one gzipped SQLite file per version, fetched the first time it is read
 *   IndexedDB "fyn-bibles"            versions the user downloaded from a catalog or imported
 *
 * Every database is opened in memory (expo-sqlite's deserialize), so nothing is written back.
 * The browser's SQLite has no FTS5; the web files are built without the full-text index.
 */
import { deserializeDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { settings } from '@/settings';

export const FORMAT = 1;

const BASE = '/bibles/';

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

type Info = Record<string, string | undefined>;
type ManifestEntry = { file: string; size: number; gzipSize: number; info: Info };
type Manifest = { format: number; strongs: ManifestEntry; versions: ManifestEntry[] };

let manifest: Manifest | null = null;

// ---- browser storage for user versions -------------------------------------------------------

const IDB_NAME = 'fyn-bibles';
/** id -> info table (small, read at startup) */
const META = 'meta';
/** id -> file bytes (read when the version is opened) */
const FILES = 'files';

let idb: Promise<IDBDatabase> | null = null;

function openIdb() {
  idb ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META);
      req.result.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => {
    idb = null;
    throw e;
  });
  return idb;
}

function done<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbAll(): Promise<Info[]> {
  const db = await openIdb();
  return done(db.transaction(META).objectStore(META).getAll() as IDBRequest<Info[]>);
}

async function idbFile(id: string): Promise<Uint8Array | undefined> {
  const db = await openIdb();
  return done(db.transaction(FILES).objectStore(FILES).get(id) as IDBRequest<Uint8Array | undefined>);
}

async function idbWrite(id: string, value: { info: Info; bytes: Uint8Array } | null) {
  const db = await openIdb();
  const tx = db.transaction([META, FILES], 'readwrite');
  if (value) {
    tx.objectStore(META).put(value.info, id);
    tx.objectStore(FILES).put(value.bytes, id);
  } else {
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
  }
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Browser storage error'));
  });
}

/** ids of versions stored by the user (they win over a bundled version with the same id) */
const userIds = new Set<string>();

// ---- connections ------------------------------------------------------------------------------

const connections = new Map<string, Promise<SQLiteDatabase>>();

const isGzip = (b: Uint8Array) => b[0] === 0x1f && b[1] === 0x8b;
const SQLITE_MAGIC = 'SQLite format 3\0';
const isSqlite = (b: Uint8Array) => b.length > 100 && String.fromCharCode(...b.subarray(0, 16)) === SQLITE_MAGIC;

async function gunzip(bytes: Uint8Array) {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Plain or gzipped SQLite bytes -> SQLite bytes. */
async function toSqlite(bytes: Uint8Array) {
  const raw = isGzip(bytes) ? await gunzip(bytes) : bytes;
  if (!isSqlite(raw)) throw new Error(`Not a Bible database (format ${FORMAT})`);
  return raw;
}

async function fetchBytes(url: string, signal?: AbortSignal, onProgress?: (received: number, total: number) => void) {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  if (!onProgress || !res.body) return new Uint8Array(await res.arrayBuffer());
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done: end, value } = await reader.read();
    if (end) break;
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}

/**
 * Opens run one at a time: expo-sqlite's worker sets up its storage on the first call, and two
 * calls at once (a screen loading two databases on a cold start) both try to and one fails.
 */
let opening: Promise<unknown> = Promise.resolve();

function deserialize(bytes: Uint8Array) {
  const db = opening.then(() => deserializeDatabaseAsync(bytes));
  opening = db.catch(() => {});
  return db;
}

function open(key: string, load: () => Promise<Uint8Array>) {
  const cached = connections.get(key);
  if (cached) return cached;
  const db = load().then(toSqlite).then(deserialize);
  connections.set(key, db);
  db.catch(() => connections.delete(key));
  return db;
}

async function close(key: string) {
  const db = connections.get(key);
  connections.delete(key);
  if (db) await db.then((d) => d.closeAsync()).catch(() => {});
}

async function loadManifest() {
  manifest ??= await (async () => {
    const res = await fetch(`${BASE}index.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Could not load the Bible list (HTTP ${res.status})`);
    return (await res.json()) as Manifest;
  })();
  return manifest;
}

export function bibleDb(versionId: string) {
  return open(versionId, async () => {
    if (userIds.has(versionId)) {
      const bytes = await idbFile(versionId);
      if (bytes) return bytes;
    }
    const entry = (await loadManifest()).versions.find((v) => v.info.id === versionId);
    if (!entry) throw new Error(`Version ${versionId} is not installed`);
    return fetchBytes(BASE + entry.file);
  });
}

export function strongsDb() {
  return open(':strongs', async () => fetchBytes(BASE + (await loadManifest()).strongs.file));
}

async function readInfo(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<{ key: string; value: string | null }>('SELECT key, value FROM info');
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? ''])) as Info;
}

const isBundled = (id: string) => !userIds.has(id) && !!manifest?.versions.some((v) => v.info.id === id);

function toVersion(info: Info, bundled = false): BibleVersion | null {
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
    bundled,
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

let setupPromise: Promise<void> | null = null;

/** Loads the list of bundled and stored versions. Safe to call more than once. */
export function setupBibles() {
  setupPromise ??= refreshVersions().catch((e) => {
    setupPromise = null;
    throw e;
  });
  return setupPromise;
}

export async function refreshVersions() {
  const { versions: bundled } = await loadManifest();
  let stored: Info[] = [];
  try {
    stored = await idbAll();
  } catch (e) {
    // private windows may block IndexedDB; the bundled versions still work
    console.warn('[versions] browser storage unavailable', e);
  }
  userIds.clear();
  stored.forEach((info) => info.id && userIds.add(info.id));

  const byId = new Map<string, BibleVersion>();
  for (const { info } of bundled) {
    const v = toVersion(info, true);
    if (v) byId.set(v.id, v);
  }
  for (const info of stored) {
    const v = toVersion(info);
    if (v) byId.set(v.id, v);
  }
  const versions = [...byId.values()].sort((a, b) => Number(b.bundled) - Number(a.bundled) || a.name.localeCompare(b.name));
  setState({ ready: true, versions });
  if (versions.length && !versions.some((v) => v.id === settings.version.get())) {
    settings.version.set(versions[0].id);
  }
}

// ---- install / download / delete --------------------------------------------------------------

/**
 * Validates a downloaded or picked .db (plain or gzipped) and stores it in the browser,
 * replacing an older copy of the same version.
 */
export async function installFile(source: Blob | Uint8Array, expectedId?: string) {
  const bytes = await toSqlite(source instanceof Uint8Array ? source : new Uint8Array(await source.arrayBuffer()));
  let version: BibleVersion | null = null;
  let info: Info = {};
  let db: SQLiteDatabase | null = null;
  try {
    db = await deserialize(bytes);
    info = await readInfo(db);
    version = toVersion(info);
    const verse = await db.getFirstAsync('SELECT ari FROM verses LIMIT 1');
    const book = await db.getFirstAsync('SELECT book FROM books LIMIT 1');
    if (!verse || !book) version = null;
  } catch {
    version = null;
  }
  if (!version || (expectedId && version.id !== expectedId)) {
    await db?.closeAsync().catch(() => {});
    throw new Error(
      version ? `Expected version ${expectedId}, got ${version.id}` : `Not a Bible database (format ${FORMAT})`,
    );
  }
  await idbWrite(version.id, { info, bytes });
  // ask the browser not to evict downloaded Bibles under storage pressure
  navigator.storage?.persist?.().catch(() => {});
  await close(version.id);
  connections.set(version.id, Promise.resolve(db!));
  await refreshVersions();
  return version;
}

/** Lets the user pick a .db file. */
export function importFromDevice() {
  return new Promise<BibleVersion | null>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.gz,.sqlite,application/octet-stream,application/x-sqlite3,application/gzip';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) resolve(null);
      else installFile(file).then(resolve, reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function deleteVersion(id: string) {
  if (isBundled(id)) throw new Error('Bundled versions cannot be removed');
  await close(id);
  await idbWrite(id, null);
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
  try {
    const bytes = await fetchBytes(entry.url, controller.signal, (received, length) => {
      const total = length > 0 ? length : (entry.size ?? 0);
      setProgress(total > 0 ? Math.min(1, received / total) : -1);
    });
    return await installFile(bytes, entry.id);
  } finally {
    aborts.delete(entry.id);
    const { [entry.id]: _, ...rest } = state.downloads;
    setState({ downloads: rest });
  }
}

export function cancelDownload(id: string) {
  aborts.get(id)?.abort();
}

/** Downloads a .db (or .db.gz) file from any link (progress under downloads[LINK_DOWNLOAD]). */
export const LINK_DOWNLOAD = ':link';

export async function downloadFromUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Enter a link starting with https://');
  if (aborts.has(LINK_DOWNLOAD)) return;
  const controller = new AbortController();
  aborts.set(LINK_DOWNLOAD, controller);
  const setProgress = (p: number) => setState({ downloads: { ...state.downloads, [LINK_DOWNLOAD]: p } });
  setProgress(0);
  try {
    const bytes = await fetchBytes(url, controller.signal, (received, total) =>
      setProgress(total > 0 ? Math.min(1, received / total) : -1),
    ).catch((e: Error) => {
      // browsers only read files from servers that allow it (CORS)
      if (e?.name === 'TypeError') throw new Error(`Could not read ${url}. The server may not allow downloads from other sites.`);
      throw e;
    });
    return await installFile(bytes);
  } finally {
    aborts.delete(LINK_DOWNLOAD);
    const { [LINK_DOWNLOAD]: _, ...rest } = state.downloads;
    setState({ downloads: rest });
  }
}

// ---- versions folder: Android only; browsers keep downloaded versions in IndexedDB ----------

export const folderSupported = false;

export function displayName(uri: string) {
  return uri.split('/').pop() ?? uri;
}

export type FolderRefresh = { added: string[]; updated: string[]; failed: string[] };

export async function chooseVersionsFolder(): Promise<FolderRefresh | null> {
  throw new Error('Not available in the browser');
}

export function forgetVersionsFolder() {}

export async function refreshFromFolder(): Promise<FolderRefresh> {
  await refreshVersions();
  return { added: [], updated: [], failed: [] };
}
