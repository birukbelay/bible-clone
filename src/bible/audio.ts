/**
 * Audio Bible, per version. A chapter's audio comes from (first match wins):
 *
 *   <documents>/audio/<versionId>/<BOOK>_<chapter>.mp3   downloaded or imported files (JHN_3.mp3)
 *   settings.audioSources[versionId].template           a URL template (from the catalog or typed in)
 *
 * Next to a chapter file an optional <BOOK>_<chapter>.json holds verse timings,
 * [{ "verse": 1, "start": 0.0 }, ...] in seconds, used to follow along in the text. The template
 * placeholders are listed in docs/fyn-rn-data.md section 7. The Bible text never depends on audio.
 * The web version (audio.web.ts) streams from templates only.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { settings } from '@/settings';

import { bookOf, chapterOf, makeAri } from './ari';
import { USFM } from './parse-ref';

export type VerseTiming = { verse: number; start: number };

export const localAudioSupported = true;

const audioRoot = () => new Directory(Paths.document, 'audio');
const audioDir = (versionId: string) => new Directory(Paths.document, 'audio', versionId);
const chapterName = (ari: number) => `${USFM[bookOf(ari)] ?? bookOf(ari) + 1}_${chapterOf(ari)}`;

/** Fills a URL template for a chapter. */
export function fillTemplate(template: string, ari: number) {
  const book = bookOf(ari);
  const chapter = chapterOf(ari);
  return template
    .replace(/\{BOOK\}/g, USFM[book] ?? String(book + 1))
    .replace(/\{book\}/g, String(book + 1))
    .replace(/\{book0\}/g, String(book))
    .replace(/\{book2\}/g, String(book + 1).padStart(2, '0'))
    .replace(/\{chapter3\}/g, String(chapter).padStart(3, '0'))
    .replace(/\{chapter2\}/g, String(chapter).padStart(2, '0'))
    .replace(/\{chapter\}/g, String(chapter));
}

function localFile(versionId: string, ari: number) {
  const file = new File(audioDir(versionId), `${chapterName(ari)}.mp3`);
  return file.exists ? file : null;
}

export function hasLocalAudio(versionId: string, ari: number) {
  return localFile(versionId, ari) != null;
}

/** Where the chapter's audio plays from, or null when the version has none for it. */
export function audioUrl(versionId: string, ari: number) {
  const local = localFile(versionId, ari);
  if (local) return local.uri;
  const template = settings.audioSources.get()[versionId]?.template;
  return template ? fillTemplate(template, ari) : null;
}

/** True when the version has any audio (files or a template). */
export function hasAudio(versionId: string) {
  if (settings.audioSources.get()[versionId]?.template) return true;
  const dir = audioDir(versionId);
  return dir.exists && dir.list().some((f) => f instanceof File && f.name.endsWith('.mp3'));
}

function parseTimings(json: unknown): VerseTiming[] | null {
  if (!Array.isArray(json)) return null;
  const list = json
    .filter((t): t is VerseTiming => typeof t?.verse === 'number' && typeof t?.start === 'number')
    .sort((a, b) => a.start - b.start);
  return list.length ? list : null;
}

/** Verse timings of a chapter: the local .json, else the template's timings URL. Null when there are none. */
export async function timings(versionId: string, ari: number): Promise<VerseTiming[] | null> {
  try {
    const file = new File(audioDir(versionId), `${chapterName(ari)}.json`);
    if (file.exists) return parseTimings(JSON.parse(await file.text()));
    const template = settings.audioSources.get()[versionId]?.timings;
    if (!template) return null;
    const res = await fetch(fillTemplate(template, ari));
    return res.ok ? parseTimings(await res.json()) : null;
  } catch {
    return null;
  }
}

// ---- downloads --------------------------------------------------------------------------------

type AudioState = {
  /** versionId -> progress of the running download: done / total chapters */
  downloads: Record<string, { done: number; total: number; failed: number }>;
  /** bumped when files change, so stats re-read */
  revision: number;
};

let state: AudioState = { downloads: {}, revision: 0 };
const listeners = new Set<() => void>();
const aborts = new Map<string, AbortController>();

function setState(patch: Partial<AudioState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAudioState() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

const changed = () => setState({ revision: state.revision + 1 });

/**
 * Downloads chapters (first-verse aris) of a version from its template to the device, so they
 * play offline. Chapters already on the device are skipped. Resolves the number of failures.
 */
export async function downloadChapters(versionId: string, chapters: number[]) {
  const source = settings.audioSources.get()[versionId];
  if (!source?.template) throw new Error('This version has no audio link');
  if (aborts.has(versionId)) return 0;
  const controller = new AbortController();
  aborts.set(versionId, controller);
  const dir = audioDir(versionId);
  dir.create({ intermediates: true, idempotent: true });
  const todo = chapters.filter((ari) => !localFile(versionId, ari));
  const progress = { done: 0, total: todo.length, failed: 0 };
  const report = () => setState({ downloads: { ...state.downloads, [versionId]: { ...progress } } });
  report();
  try {
    for (const ari of todo) {
      if (controller.signal.aborted) break;
      const part = new File(Paths.cache, `audio-${versionId}-${chapterName(ari)}.part`);
      try {
        await File.downloadFileAsync(fillTemplate(source.template, ari), part, { idempotent: true, signal: controller.signal });
        await part.move(new File(dir, `${chapterName(ari)}.mp3`));
        if (source.timings) {
          const res = await fetch(fillTemplate(source.timings, ari)).catch(() => null);
          const list = res?.ok ? parseTimings(await res.json().catch(() => null)) : null;
          if (list) new File(dir, `${chapterName(ari)}.json`).write(JSON.stringify(list));
        }
      } catch (e) {
        if (controller.signal.aborted) break;
        console.warn(`[audio] could not download ${versionId} ${chapterName(ari)}`, e);
        progress.failed++;
      } finally {
        if (part.exists) part.delete();
      }
      progress.done++;
      report();
    }
  } finally {
    aborts.delete(versionId);
    const { [versionId]: _, ...rest } = state.downloads;
    setState({ downloads: rest });
    changed();
  }
  return progress.failed;
}

/** All chapters of a book (chapter count from the version's books). */
export function bookChapters(book: number, chapters: number) {
  return Array.from({ length: chapters }, (_, i) => makeAri(book, i + 1, 1));
}

export function cancelAudioDownload(versionId: string) {
  aborts.get(versionId)?.abort();
}

/** Book and chapter from an audio file name: "JHN_3.mp3", "JHN03.mp3", "43_3.mp3" (books numbered 1-66)... */
export function chapterFromName(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, '');
  let m = /^(\d{1,2})_(\d{1,3})$/.exec(base);
  if (m) return Number(m[1]) >= 1 && Number(m[1]) <= USFM.length ? makeAri(Number(m[1]) - 1, Number(m[2]), 1) : null;
  m = /^([1-4]?[A-Z]{2,3})[ _.-]*0*(\d{1,3})$/i.exec(base);
  if (m) {
    const book = USFM.indexOf(m[1].toUpperCase());
    if (book >= 0) return makeAri(book, Number(m[2]), 1);
  }
  return null;
}

/**
 * Copies picked audio files into the version's folder. File names must say the chapter (see
 * chapterFromName); .json timings files with the same names are taken too. Resolves the number
 * of files added and the names that were skipped, or null when the user cancelled.
 */
export async function importAudioFiles(versionId: string) {
  const picked = await File.pickFileAsync({ multipleFiles: true, mimeTypes: ['audio/*', 'application/json', '*/*'] });
  if (picked.canceled || !picked.result) return null;
  const dir = audioDir(versionId);
  dir.create({ intermediates: true, idempotent: true });
  let added = 0;
  const skipped: string[] = [];
  for (const file of picked.result) {
    const name = file.name;
    const ext = /\.(mp3|m4a|aac|ogg|json)$/i.exec(name)?.[1]?.toLowerCase();
    const ari = chapterFromName(name);
    if (!ext || ari == null) {
      skipped.push(name);
      continue;
    }
    const target = new File(dir, `${chapterName(ari)}.${ext === 'json' ? 'json' : 'mp3'}`);
    try {
      if (target.exists) target.delete();
      await file.copy(target);
      if (ext !== 'json') added++;
    } catch (e) {
      console.warn(`[audio] could not import ${name}`, e);
      skipped.push(name);
    }
  }
  changed();
  return { added, skipped };
}

/** Removes the version's audio files from the device (the link stays). */
export function deleteAudio(versionId: string) {
  const dir = audioDir(versionId);
  if (dir.exists) dir.delete();
  changed();
}

/** Chapters on the device and their size in bytes. */
export function audioStats(versionId: string) {
  const dir = audioDir(versionId);
  if (!dir.exists) return { chapters: 0, size: 0 };
  const files = dir.list().filter((f): f is File => f instanceof File && f.name.endsWith('.mp3'));
  return { chapters: files.length, size: files.reduce((sum, f) => sum + (f.size ?? 0), 0) };
}

/** Versions with audio files on the device (also ones whose text was removed). */
export function versionsWithFiles() {
  const root = audioRoot();
  if (!root.exists) return [];
  return root
    .list()
    .filter((d): d is Directory => d instanceof Directory)
    .map((d) => d.name);
}
