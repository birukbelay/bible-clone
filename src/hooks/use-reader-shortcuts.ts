/**
 * The reader's desktop-browser extras: keyboard shortcuts, the browser's full screen and the
 * page title. Nothing on iOS / Android (see use-reader-shortcuts.web.ts).
 */
export type ReaderShortcuts = {
  /** listen only while the reader is on screen and nothing covers it */
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggleFullscreen: () => void;
  onEscape: () => void;
};

export function useReaderShortcuts(_shortcuts: ReaderShortcuts) {}

/** Follows the app's full screen with the browser's (and back, when the browser leaves it). */
export function useBrowserFullscreen(_fullscreen: boolean, _onExit: () => void) {}

/** Asks the browser for full screen; must run in a click or key handler. */
export function requestBrowserFullscreen() {}

export function useDocumentTitle(_title: string | null) {}
