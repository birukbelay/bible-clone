/** Audio Bible in the browser: streamed from the version's URL template only. Same exports as audio.ts. */
import { useSyncExternalStore } from 'react';

import { settings } from '@/settings';

import { bookOf, chapterOf, makeAri } from './ari';
import { USFM } from './parse-ref';

export type VerseTiming = { verse: number; start: number };

export const localAudioSupported = false;

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

export const hasLocalAudio = (_versionId: string, _ari: number) => false;

export function audioUrl(versionId: string, ari: number) {
  const template = settings.audioSources.get()[versionId]?.template;
  return template ? fillTemplate(template, ari) : null;
}

export const hasAudio = (versionId: string) => !!settings.audioSources.get()[versionId]?.template;

export async function timings(versionId: string, ari: number): Promise<VerseTiming[] | null> {
  const template = settings.audioSources.get()[versionId]?.timings;
  if (!template) return null;
  try {
    const res = await fetch(fillTemplate(template, ari));
    const json: unknown = res.ok ? await res.json() : null;
    if (!Array.isArray(json)) return null;
    const list = json
      .filter((t): t is VerseTiming => typeof t?.verse === 'number' && typeof t?.start === 'number')
      .sort((a, b) => a.start - b.start);
    return list.length ? list : null;
  } catch {
    return null;
  }
}

type AudioState = {
  downloads: Record<string, { done: number; total: number; failed: number }>;
  revision: number;
};

const state: AudioState = { downloads: {}, revision: 0 };
const subscribe = () => () => {};

export function useAudioState() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export async function downloadChapters(_versionId: string, _chapters: number[]): Promise<number> {
  throw new Error('Not available in the browser');
}

export function bookChapters(book: number, chapters: number) {
  return Array.from({ length: chapters }, (_, i) => makeAri(book, i + 1, 1));
}

export function cancelAudioDownload(_versionId: string) {}

export function chapterFromName(_name: string): number | null {
  return null;
}

export async function importAudioFiles(_versionId: string): Promise<{ added: number; skipped: string[] } | null> {
  throw new Error('Not available in the browser');
}

export function deleteAudio(_versionId: string) {}

export const audioStats = (_versionId: string) => ({ chapters: 0, size: 0 });

export const versionsWithFiles = (): string[] => [];
