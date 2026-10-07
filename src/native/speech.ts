/**
 * Text to speech with the phone's own voices (no online service). expo-speech is optional:
 * without it read-aloud reports itself unavailable and the play button scrolls instead.
 * The web version (speech.web.ts) uses the browser's speechSynthesis.
 *
 * To enable: bunx expo install expo-speech, then rebuild the app.
 */
import { Platform } from 'react-native';

export type Voice = { identifier: string; name: string; language: string };

export type SpeakOptions = {
  /** BCP-47, e.g. "am" or "en-US" */
  language?: string;
  /** Voice.identifier; empty = the default voice for the language */
  voice?: string;
  /** 1 = normal */
  rate?: number;
  onDone?: () => void;
  /** stopped with stopSpeaking() */
  onStopped?: () => void;
  onError?: (e: Error) => void;
};

/** The part of expo-speech used here (typed locally: the package may be missing). */
type ExpoSpeech = {
  speak(
    text: string,
    options: {
      language?: string;
      voice?: string;
      rate?: number;
      onDone?: () => void;
      onStopped?: () => void;
      onError?: (e: Error) => void;
    },
  ): void;
  stop(): Promise<void>;
  getAvailableVoicesAsync(): Promise<{ identifier: string; name: string; language: string }[]>;
  maxSpeechInputLength: number;
};

let loaded: ExpoSpeech | null | undefined;

function speech(): ExpoSpeech | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === 'web') return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    loaded = require('expo-speech') as ExpoSpeech;
  } catch {
    loaded = null;
  }
  return loaded;
}

export const speechAvailable = () => speech() != null;

export function speak(text: string, options: SpeakOptions = {}) {
  const S = speech();
  if (!S) {
    options.onError?.(new Error('Read aloud is not available in this build'));
    return;
  }
  S.speak(text.slice(0, S.maxSpeechInputLength || 4000), {
    language: options.language,
    voice: options.voice || undefined,
    // Android and iOS have different scales; 1 is normal on both
    rate: options.rate ?? 1,
    onDone: options.onDone,
    onStopped: options.onStopped,
    onError: options.onError,
  });
}

export function stopSpeaking() {
  return speech()?.stop() ?? Promise.resolve();
}

export async function getVoices(): Promise<Voice[]> {
  const S = speech();
  if (!S) return [];
  try {
    return (await S.getAvailableVoicesAsync()).map((v) => ({ identifier: v.identifier, name: v.name, language: v.language }));
  } catch {
    return [];
  }
}
