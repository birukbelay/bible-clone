/**
 * One audio player for the audio Bible, on expo-audio (background playback, lock screen controls).
 * expo-audio is optional: without it createPlayer() returns null and the app reads aloud or
 * scrolls instead. The web version (audio-player.web.ts) uses an <audio> element.
 *
 * To enable: bunx expo install expo-audio (adds the "expo-audio" plugin to app.json; background
 * playback is on by default), then rebuild the app.
 */
import { Platform } from 'react-native';

export type PlayerStatus = {
  playing: boolean;
  /** seconds */
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  isBuffering: boolean;
  /** the track ended (once per end) */
  didJustFinish: boolean;
};

export type TrackInfo = { title: string; artist?: string; album?: string };

export type Player = {
  load(uri: string, info: TrackInfo): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setRate(rate: number): void;
  onStatus(listener: (status: PlayerStatus) => void): () => void;
  /** media keys / lock screen buttons other than play and pause */
  onRemote(listener: (action: 'next' | 'previous') => void): () => void;
  release(): void;
};

/** The parts of expo-audio used here (typed locally: the package may be missing). */
type NativePlayer = {
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  replace(source: { uri: string }): void;
  setPlaybackRate?(rate: number, pitchCorrectionQuality?: string): void;
  playbackRate: number;
  shouldCorrectPitch?: boolean;
  setActiveForLockScreen?(
    active: boolean,
    metadata?: { title?: string; artist?: string; albumTitle?: string },
    options?: { showSeekBackward?: boolean; showSeekForward?: boolean },
  ): void;
  updateLockScreenMetadata?(metadata: { title?: string; artist?: string; albumTitle?: string }): void;
  clearLockScreenControls?(): void;
  addListener(
    event: 'playbackStatusUpdate',
    listener: (s: Partial<PlayerStatus> & { playing?: boolean }) => void,
  ): { remove(): void };
  remove(): void;
};

type ExpoAudio = {
  createAudioPlayer(source: { uri: string } | null, options?: { updateInterval?: number }): NativePlayer;
  setAudioModeAsync(mode: Record<string, unknown>): Promise<void>;
};

let loaded: ExpoAudio | null | undefined;

function audio(): ExpoAudio | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === 'web') return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    loaded = require('expo-audio') as ExpoAudio;
  } catch {
    loaded = null;
  }
  return loaded;
}

export const audioPlayerAvailable = () => audio() != null;

let modeSet = false;

export function createPlayer(): Player | null {
  const A = audio();
  if (!A) return null;
  if (!modeSet) {
    modeSet = true;
    A.setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      interruptionModeAndroid: 'doNotMix',
    }).catch((e) => console.warn('[audio] could not set the audio mode', e));
  }
  const player = A.createAudioPlayer(null, { updateInterval: 250 });
  const listeners = new Set<(s: PlayerStatus) => void>();
  let info: TrackInfo | null = null;
  let rate = 1;
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    const status: PlayerStatus = {
      playing: !!s.playing,
      currentTime: s.currentTime ?? 0,
      duration: s.duration ?? 0,
      isLoaded: !!s.isLoaded,
      isBuffering: !!s.isBuffering,
      didJustFinish: !!s.didJustFinish,
    };
    listeners.forEach((l) => l(status));
  });
  const applyRate = () => {
    if (player.setPlaybackRate) player.setPlaybackRate(rate, 'high');
    else player.playbackRate = rate;
  };
  return {
    load(uri, track) {
      info = track;
      player.replace({ uri });
      applyRate();
      try {
        player.setActiveForLockScreen?.(
          true,
          { title: track.title, artist: track.artist, albumTitle: track.album },
          { showSeekBackward: true, showSeekForward: true },
        );
      } catch (e) {
        console.warn('[audio] lock screen controls are not available', e);
      }
    },
    play: () => player.play(),
    pause: () => player.pause(),
    seekTo: (seconds) => void player.seekTo(seconds).catch(() => {}),
    setRate(r) {
      rate = r;
      applyRate();
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // expo-audio's lock screen has play / pause / seek; next and previous are not exposed
    onRemote: () => () => {},
    release() {
      listeners.clear();
      sub.remove();
      if (info) player.clearLockScreenControls?.();
      player.remove();
    },
  };
}
