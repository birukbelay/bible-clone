/**
 * Listening to a chapter: the version's audio Bible when it has one for the chapter (audio.ts),
 * else reading aloud with the phone's voices (speech.ts). One session at a time, shared by the
 * reader and the audio screen. With "continue" on, the next chapter follows and the reader moves
 * along (settings.position). The reader falls back to scrolling when start() resolves false.
 */
import { useSyncExternalStore } from 'react';

import { t } from '@/i18n';
import { audioPlayerAvailable, createPlayer, type Player, type PlayerStatus } from '@/native/audio-player';
import { speak, speechAvailable, stopSpeaking } from '@/native/speech';
import { settings } from '@/settings';

import { chapterRange, makeAri, bookOf, chapterOf, verseOf } from './ari';
import { audioUrl, timings, type VerseTiming } from './audio';
import { plainText } from './markup';
import { getBooks, getChapter, type Verse } from './queries';
import { adjacentChapter, bookChapterTitle } from './reference';
import { getVersion } from './versions';

export type PlaybackMode = 'audio' | 'tts';

export type PlaybackState = {
  mode: PlaybackMode | null;
  versionId: string;
  /** first verse of the chapter being played */
  chapterAri: number;
  /** verse being read (0 when unknown, e.g. audio without timings) */
  verseAri: number;
  playing: boolean;
  loading: boolean;
  /** seconds (audio only) */
  position: number;
  duration: number;
  /** when the sleep timer stops playback (ms), 'chapter' = at the end of this chapter, 0 = off */
  sleepAt: number | 'chapter';
  title: string;
};

const IDLE: PlaybackState = {
  mode: null,
  versionId: '',
  chapterAri: 0,
  verseAri: 0,
  playing: false,
  loading: false,
  position: 0,
  duration: 0,
  sleepAt: 0,
  title: '',
};

let state: PlaybackState = IDLE;
const listeners = new Set<() => void>();

function setState(patch: Partial<PlaybackState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePlayback() {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** One value of the state (re-renders only when it changes); `select` must return a primitive. */
export function usePlaybackValue<T>(select: (s: PlaybackState) => T) {
  return useSyncExternalStore(subscribe, () => select(state), () => select(state));
}

export const getPlayback = () => state;

/** Either way of listening works in this build (the audio Bible may still be missing for a version). */
export const listeningAvailable = () => audioPlayerAvailable() || speechAvailable();

// ---- session ----------------------------------------------------------------------------------

/** bumped by every start / stop, so callbacks of an older session do nothing */
let session = 0;
let player: Player | null = null;
let unsubscribe: (() => void) | null = null;
let verseTimings: VerseTiming[] | null = null;
/** TTS: the chapter's verses and the one being spoken */
let verses: Verse[] = [];
let index = 0;
let sleepTimer: ReturnType<typeof setTimeout> | null = null;

function ensurePlayer() {
  if (player) return player;
  player = createPlayer();
  if (!player) return null;
  unsubscribe = player.onStatus(onStatus);
  player.onRemote((action) => void (action === 'next' ? skipChapter(1) : skipChapter(-1)));
  return player;
}

function onStatus(s: PlayerStatus) {
  if (state.mode !== 'audio') return;
  let verseAri = state.verseAri;
  if (verseTimings) {
    let current = verseTimings[0];
    for (const timing of verseTimings) {
      if (timing.start <= s.currentTime + 0.05) current = timing;
      else break;
    }
    verseAri = makeAri(bookOf(state.chapterAri), chapterOf(state.chapterAri), current.verse);
  }
  setState({
    playing: s.playing,
    loading: !s.isLoaded || s.isBuffering,
    position: s.currentTime,
    duration: s.duration || state.duration,
    verseAri,
  });
  if (s.didJustFinish) void chapterEnded();
}

async function chapterEnded() {
  if (state.sleepAt === 'chapter' || !settings.audioContinue.get()) {
    stop();
    return;
  }
  await skipChapter(1);
}

/**
 * Starts listening to a chapter, from `fromAri` when given. Resolves false when neither the
 * audio Bible nor reading aloud is available for it (the caller then scrolls instead).
 */
export async function start(versionId: string, chapterAri: number, fromAri = 0): Promise<boolean> {
  const id = ++session;
  const first = chapterRange(chapterAri)[0] + 1;
  const keepSleep = state.mode ? state.sleepAt : 0;
  halt();
  const books = await getBooks(versionId).catch(() => undefined);
  if (id !== session) return true;
  const version = getVersion(versionId);
  const title = `${bookChapterTitle(books, first)}${version ? ` · ${version.shortName}` : ''}`;
  const url = audioUrl(versionId, first);
  const p = url ? ensurePlayer() : null;
  if (url && p) {
    setState({ ...IDLE, mode: 'audio', versionId, chapterAri: first, playing: true, loading: true, sleepAt: keepSleep, title });
    verseTimings = null;
    p.setRate(settings.audioRate.get());
    p.load(url, { title: bookChapterTitle(books, first), artist: version?.name, album: version?.name });
    p.play();
    void timings(versionId, first).then((list) => {
      if (id !== session) return;
      verseTimings = list;
      const from = list && fromAri ? list.find((x) => x.verse === verseOf(fromAri)) : undefined;
      if (from) p.seekTo(from.start);
    });
    return true;
  }
  if (!speechAvailable()) return false;
  const { verses: list } = await getChapter(versionId, first);
  if (id !== session) return true;
  verses = list.filter((v) => plainText(v.text).trim());
  if (!verses.length) return false;
  index = Math.max(0, fromAri ? verses.findIndex((v) => v.ari <= fromAri && fromAri <= Math.max(v.ari, v.ari_end)) : 0);
  setState({ ...IDLE, mode: 'tts', versionId, chapterAri: first, playing: true, sleepAt: keepSleep, title });
  speakCurrent(id);
  return true;
}

function speakCurrent(id: number) {
  const verse = verses[index];
  if (!verse) {
    void chapterEnded();
    return;
  }
  setState({ verseAri: verse.ari, playing: true });
  const version = getVersion(state.versionId);
  speak(plainText(verse.text), {
    language: version?.locale,
    voice: settings.ttsVoice.get(),
    rate: settings.ttsRate.get(),
    onDone: () => {
      if (id !== session || !state.playing) return;
      index++;
      speakCurrent(id);
    },
    onError: (e) => {
      if (id !== session) return;
      console.warn('[playback] read aloud failed', e);
      stop();
    },
  });
}

/** Stops sound without forgetting the session. */
function halt() {
  if (state.mode === 'audio') player?.pause();
  if (state.mode === 'tts') void stopSpeaking();
}

export function pause() {
  if (!state.mode) return;
  session++;
  halt();
  setState({ playing: false });
}

export function resume() {
  if (!state.mode) return;
  if (state.mode === 'audio') {
    player?.play();
    setState({ playing: true });
  } else {
    speakCurrent(++session);
  }
}

export function toggle() {
  if (state.playing) pause();
  else resume();
}

export function stop() {
  session++;
  halt();
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  verses = [];
  verseTimings = null;
  setState(IDLE);
}

/** Releases the native player (when the app no longer needs it). */
export function release() {
  stop();
  unsubscribe?.();
  player?.release();
  player = null;
  unsubscribe = null;
}

/** Next / previous chapter of the same version; the reader moves along. */
export async function skipChapter(delta: 1 | -1) {
  if (!state.mode) return;
  const { versionId, chapterAri } = state;
  const books = await getBooks(versionId).catch(() => undefined);
  const next = adjacentChapter(books, chapterAri, delta);
  if (next == null) {
    stop();
    return;
  }
  settings.position.set(next);
  await start(versionId, next);
}

/** Moves by a verse (reading aloud, or audio with timings) or by 10 seconds (audio without). */
export function skipVerse(delta: 1 | -1) {
  if (state.mode === 'tts') {
    index = Math.min(verses.length - 1, Math.max(0, index + delta));
    halt();
    speakCurrent(++session);
    return;
  }
  if (state.mode !== 'audio' || !player) return;
  if (verseTimings) {
    const at = verseTimings.findIndex((x) => makeAri(bookOf(state.chapterAri), chapterOf(state.chapterAri), x.verse) === state.verseAri);
    const target = verseTimings[Math.min(verseTimings.length - 1, Math.max(0, at + delta))];
    if (target) player.seekTo(target.start);
  } else {
    player.seekTo(Math.max(0, state.position + delta * 10));
  }
}

export function seekTo(seconds: number) {
  if (state.mode === 'audio') player?.seekTo(Math.max(0, seconds));
}

/** Plays from a verse of the chapter being played (or starts the chapter there). */
export function playFrom(versionId: string, ari: number) {
  return start(versionId, ari, ari);
}

export function setRate(rate: number) {
  if (state.mode === 'tts') {
    settings.ttsRate.set(rate);
    if (state.playing) {
      halt();
      speakCurrent(++session);
    }
  } else {
    settings.audioRate.set(rate);
    player?.setRate(rate);
  }
}

export const currentRate = () => (state.mode === 'tts' ? settings.ttsRate.get() : settings.audioRate.get());

/** Sleep timer: minutes from now, 'chapter' for the end of this chapter, 0 for off. */
export function setSleep(minutes: number | 'chapter') {
  if (sleepTimer) clearTimeout(sleepTimer);
  sleepTimer = null;
  if (minutes === 'chapter') {
    setState({ sleepAt: 'chapter' });
    return;
  }
  if (!minutes) {
    setState({ sleepAt: 0 });
    return;
  }
  const at = Date.now() + minutes * 60_000;
  sleepTimer = setTimeout(() => {
    sleepTimer = null;
    pause();
    setState({ sleepAt: 0 });
  }, at - Date.now());
  setState({ sleepAt: at });
}

export const SLEEP_OPTIONS: (number | 'chapter')[] = [0, 5, 10, 15, 30, 45, 60, 'chapter'];

export function sleepLabel(option: number | 'chapter') {
  if (option === 'chapter') return t('End of chapter');
  if (!option) return t('Off');
  return t('{n} min', { n: option });
}

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** "1:05" */
export function formatTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
