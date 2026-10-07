/** Text to speech in the browser (speechSynthesis, the system's voices). Same exports as speech.ts. */
import type { SpeakOptions, Voice } from './speech';

export type { SpeakOptions, Voice };

const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);

export const speechAvailable = () => synth() != null;

/** the utterance being spoken; its handlers are cleared when it is replaced or stopped */
let current: { utterance: SpeechSynthesisUtterance; options: SpeakOptions } | null = null;

export function speak(text: string, options: SpeakOptions = {}) {
  const s = synth();
  if (!s) {
    options.onError?.(new Error('Read aloud is not available in this browser'));
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  if (options.language) utterance.lang = options.language;
  const voice = options.voice ? s.getVoices().find((v) => v.voiceURI === options.voice) : undefined;
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 1;
  const entry = { utterance, options };
  utterance.onend = () => {
    if (current !== entry) return;
    current = null;
    options.onDone?.();
  };
  utterance.onerror = (e) => {
    if (current !== entry) return;
    current = null;
    if (e.error === 'interrupted' || e.error === 'canceled') options.onStopped?.();
    else options.onError?.(new Error(e.error));
  };
  current = entry;
  s.speak(utterance);
}

export async function stopSpeaking() {
  const stopped = current;
  current = null;
  synth()?.cancel();
  stopped?.options.onStopped?.();
}

export async function getVoices(): Promise<Voice[]> {
  const s = synth();
  if (!s) return [];
  let list = s.getVoices();
  if (!list.length) {
    // Chrome loads the voices after the first call
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500);
      s.addEventListener('voiceschanged', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    list = s.getVoices();
  }
  return list.map((v) => ({ identifier: v.voiceURI, name: v.name, language: v.lang }));
}
