/**
 * Device-local preferences (not synced): current version, reading position, display options.
 * Stored in expo-sqlite's key-value store (localStorage on the web, see src/kv.web.ts);
 * synced user data lives in WatermelonDB (src/db).
 */
import { useSyncExternalStore } from 'react';

import { kv } from '@/kv';

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
    const raw = kv.get(key);
    if (raw != null) value = JSON.parse(raw) as T;
  } catch {
    value = fallback;
  }
  return {
    get: () => value,
    set(next, notify = true) {
      value = next;
      kv.set(key, JSON.stringify(next));
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

export type ThemeChoice = 'system' | 'light' | 'dark' | 'sepia' | 'black';

/** What Copy / Share put around the verse text. */
export type CopyOptions = {
  /** verse numbers before each verse of a range */
  numbers: boolean;
  /** reference before or after the text */
  reference: 'before' | 'after' | 'none';
  /** version name after the reference */
  version: boolean;
  /** "— John 3:16 (KJV)" or "John 3:16 KJV" or "(John 3:16)" */
  style: 'dash' | 'plain' | 'parens';
  /** each verse on its own line */
  lines: boolean;
};

/** Source of a version's audio Bible, see docs/fyn-rn-data.md section 7. */
export type AudioSource = {
  /** URL with {BOOK} (USFM code), {book} (1-based number), {book0} (0-based), {chapter}, {chapter3} */
  template?: string;
  /** URL of a timings JSON template (same placeholders) for verse highlighting; optional */
  timings?: string;
};

export const settings = {
  /** id of the Bible version shown in the reader (info.id of its .db) */
  version: createSetting('reader.version', 'AMH1954'),
  /** ari of the last read verse (Genesis 1:1) */
  position: createSetting('reader.position', 0x000101),
  /** app colors: follow the phone, or always light / dark */
  theme: createSetting<ThemeChoice>('app.theme', 'system'),
  fontSize: createSetting('reader.fontSize', 19),
  /** show Strong's numbers after tagged words (versions with strongs = 1) */
  showStrongs: createSetting('reader.showStrongs', false),
  redLetters: createSetting('reader.redLetters', true),
  /** show the translators' notes under every verse; when off each verse has a "note" marker to open them */
  showNotes: createSetting('reader.showNotes', false),
  /** show a second version next to the first one */
  split: createSetting('reader.split', false),
  /** id of the version in the right column of the split view */
  splitVersion: createSetting('reader.splitVersion', 'KJV'),
  /** width of the left column in the split view, 0..1 */
  splitRatio: createSetting('reader.splitRatio', 0.5),
  /** reader without its header, the tab bar and the status bar; only prev / next chapter stay */
  fullscreen: createSetting('reader.fullscreen', false),
  /** auto-scroll speed (play button), multiple of the base speed */
  scrollSpeed: createSetting('reader.scrollSpeed', 1),
  /** URL of a versions catalog JSON (see docs/fyn-rn-data.md); empty = none */
  catalogUrl: createSetting('versions.catalogUrl', ''),
  /** asset hash of each bundled .db that was copied to the bibles folder */
  bundledHashes: createSetting<Record<string, string>>('versions.bundledHashes', {}),
  /**
   * Android: content:// URI of a folder the user picked (Documents/Fyn Bible, ...) where every
   * version is also kept so it can be found, shared and backed up; empty = app storage only
   */
  versionsFolder: createSetting('versions.folder', ''),
  /** files of the versions folder already loaded: name -> size, time and version id */
  versionsFolderSeen: createSetting<Record<string, { size: number; time: number; id: string }>>('versions.folderSeen', {}),
  /** language of the app's buttons and labels; 'system' follows the phone */
  language: createSetting<'system' | 'en' | 'am'>('app.language', 'system'),
  /** calendar of the dates in reading plans; 'auto' is Ethiopian when the app is in Amharic */
  calendar: createSetting<'auto' | 'gregorian' | 'ethiopian'>('app.calendar', 'auto'),

  /** line height as a multiple of the font size */
  lineSpacing: createSetting('reader.lineSpacing', 1.55),
  /** extra horizontal padding of the reader text, in points */
  margins: createSetting('reader.margins', 0),
  /** every verse starts on its own line instead of running as paragraphs */
  verseLines: createSetting('reader.verseLines', false),
  /** size of [bracketed] and {braced} text (brackets included), percent of the verse text; always below 100 */
  asideSize: createSetting('reader.asideSize', 80),
  /** opacity of [bracketed] and {braced} text, percent */
  asideOpacity: createSetting('reader.asideOpacity', 65),
  /** font of the Bible text */
  fontFamily: createSetting<'sans' | 'serif' | 'mono'>('reader.fontFamily', 'sans'),
  copy: createSetting<CopyOptions>('reader.copy', {
    numbers: true,
    reference: 'after',
    version: true,
    style: 'dash',
    lines: false,
  }),
  /** chapters opened in the reader, newest last (aris); with the back / forward index */
  history: createSetting<{ items: number[]; index: number }>('reader.history', { items: [], index: -1 }),
  /** last searches, newest first */
  searchHistory: createSetting<string[]>('search.history', []),
  /** read aloud (text to speech) speed, 1 = normal */
  ttsRate: createSetting('tts.rate', 1),
  /** identifier of the voice; empty = the phone's default for the version's language */
  ttsVoice: createSetting('tts.voice', ''),
  /** audio Bible playback speed */
  audioRate: createSetting('audio.rate', 1),
  /** play the next chapter when one ends (audio and read aloud) */
  audioContinue: createSetting('audio.continue', true),
  /** audio Bible URL template of each version (version id -> source); catalog entries fill it too */
  audioSources: createSetting<Record<string, AudioSource>>('audio.sources', {}),
  /** chapters read: chapter ari (verse 0) -> last time read (ms) */
  readChapters: createSetting<Record<string, number>>('progress.chapters', {}),
  /** days with some reading: 'YYYY-MM-DD' -> chapters read that day */
  readDays: createSetting<Record<string, number>>('progress.days', {}),
  /** daily reminder to review the memory verses */
  memoryReminder: createSetting<{ enabled: boolean; time: string }>('memory.reminder', { enabled: false, time: '08:00' }),
};
