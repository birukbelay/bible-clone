import { useEffect, useEffectEvent } from 'react';

import type { ReaderShortcuts } from './use-reader-shortcuts';

export type { ReaderShortcuts };

/** typing in a field, or a key the page or the browser already handled */
function ignore(e: KeyboardEvent) {
  const target = e.target instanceof Element ? e.target : null;
  return (
    e.defaultPrevented ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    !!target?.closest('input, textarea, select, [contenteditable="true"]')
  );
}

/** ← / → previous / next chapter, F full screen, Esc closes menus, the selection, full screen. */
export function useReaderShortcuts({ enabled, onPrev, onNext, onToggleFullscreen, onEscape }: ReaderShortcuts) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (ignore(e)) return;
    if (e.key === 'ArrowLeft') onPrev();
    else if (e.key === 'ArrowRight') onNext();
    else if (e.key === 'f' || e.key === 'F') onToggleFullscreen();
    else if (e.key === 'Escape') onEscape();
    else return;
    e.preventDefault();
  });

  useEffect(() => {
    if (!enabled) return;
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled]);
}

export function useBrowserFullscreen(fullscreen: boolean, onExit: () => void) {
  const exit = useEffectEvent(onExit);

  useEffect(() => {
    if (!fullscreen && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [fullscreen]);

  // Esc or the browser's own button leaves the browser's full screen: leave the app's too
  useEffect(() => {
    const listener = () => {
      if (!document.fullscreenElement) exit();
    };
    document.addEventListener('fullscreenchange', listener);
    return () => document.removeEventListener('fullscreenchange', listener);
  }, []);
}

export function requestBrowserFullscreen() {
  // not on iPhones; the app's full screen still hides the bars
  document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Sets the tab title while `title` is not null. */
export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title != null) document.title = title;
  }, [title]);
}
