/** Audio Bible player in the browser: an <audio> element plus the Media Session (lock screen, media keys). */
import type { Player, PlayerStatus, TrackInfo } from './audio-player';

export type { Player, PlayerStatus, TrackInfo };

export const audioPlayerAvailable = () => typeof Audio !== 'undefined';

export function createPlayer(): Player | null {
  if (!audioPlayerAvailable()) return null;
  const el = new Audio();
  el.preload = 'auto';
  const listeners = new Set<(s: PlayerStatus) => void>();
  const remotes = new Set<(a: 'next' | 'previous') => void>();
  let rate = 1;
  const emit = (didJustFinish = false) => {
    const status: PlayerStatus = {
      playing: !el.paused && !el.ended,
      currentTime: el.currentTime || 0,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      isLoaded: el.readyState >= 2,
      isBuffering: !el.paused && el.readyState < 3,
      didJustFinish,
    };
    listeners.forEach((l) => l(status));
  };
  const onTime = () => emit();
  const onEnded = () => emit(true);
  const events = ['timeupdate', 'play', 'pause', 'loadedmetadata', 'waiting', 'playing', 'error'] as const;
  events.forEach((e) => el.addEventListener(e, onTime));
  el.addEventListener('ended', onEnded);

  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => void el.play()],
    ['pause', () => el.pause()],
    ['seekbackward', () => (el.currentTime = Math.max(0, el.currentTime - 10))],
    ['seekforward', () => (el.currentTime = el.currentTime + 10)],
    ['nexttrack', () => remotes.forEach((r) => r('next'))],
    ['previoustrack', () => remotes.forEach((r) => r('previous'))],
  ];
  for (const [action, handler] of handlers) {
    try {
      session?.setActionHandler(action, handler);
    } catch {
      // action not supported by this browser
    }
  }

  return {
    load(uri: string, info: TrackInfo) {
      el.src = uri;
      el.playbackRate = rate;
      if (session && typeof MediaMetadata !== 'undefined') {
        session.metadata = new MediaMetadata({ title: info.title, artist: info.artist, album: info.album });
      }
    },
    play: () => {
      el.playbackRate = rate;
      el.play().catch((e: Error) => {
        console.warn('[audio] could not play', e);
        emit();
      });
    },
    pause: () => el.pause(),
    seekTo: (seconds) => {
      el.currentTime = seconds;
    },
    setRate(r) {
      rate = r;
      el.playbackRate = r;
    },
    onStatus(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onRemote(listener) {
      remotes.add(listener);
      return () => remotes.delete(listener);
    },
    release() {
      el.pause();
      events.forEach((e) => el.removeEventListener(e, onTime));
      el.removeEventListener('ended', onEnded);
      el.removeAttribute('src');
      el.load();
      listeners.clear();
      remotes.clear();
      for (const [action] of handlers) {
        try {
          session?.setActionHandler(action, null);
        } catch {
          // not supported
        }
      }
      if (session) session.metadata = null;
    },
  };
}
