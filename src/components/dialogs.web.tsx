/**
 * Web version of dialogs.tsx: react-native-web's Alert does nothing and its Share only works
 * where the browser has navigator.share, so confirmations and messages are drawn in the page
 * by <DialogHost /> (rendered once in the root layout) and sharing falls back to the clipboard.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { ThemedText } from './themed-text';

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** label of the confirm button (default "OK") */
  confirmText?: string;
  destructive?: boolean;
};

type Dialog = ConfirmOptions & { cancel: boolean; resolve: (ok: boolean) => void };

let queue: Dialog[] = [];
let shownToast: { text: string; key: number } | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

function show(dialog: Omit<Dialog, 'resolve'>) {
  return new Promise<boolean>((resolve) => {
    queue = [...queue, { ...dialog, resolve }];
    emit();
  });
}

function close(ok: boolean) {
  const [first, ...rest] = queue;
  if (!first) return;
  queue = rest;
  emit();
  first.resolve(ok);
}

/** Resolves true when the user confirms. */
export function confirm(options: ConfirmOptions) {
  return show({ ...options, cancel: true });
}

export function notify(title: string, message?: string) {
  void show({ title, message, cancel: false });
}

/** `notify` for a failed action: `promise.catch(showError('Could not save'))`. */
export function showError(title: string) {
  return (e: unknown) => notify(title, e instanceof Error ? e.message : String(e));
}

/** Short note at the bottom of the page. */
export function toast(text: string) {
  shownToast = { text, key: Date.now() };
  emit();
}

/** The share sheet where the browser has one (phones), else copy to the clipboard. */
export async function share(message: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text: message });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // closed by the user
    }
  }
  await navigator.clipboard.writeText(message);
  toast('Copied to the clipboard');
}

export function DialogHost() {
  const dialog = useSyncExternalStore(subscribe, () => queue[0], () => undefined);
  const current = useSyncExternalStore(subscribe, () => shownToast, () => null);
  // on <body>, above react-native-web's modals (the book drawer)
  return (
    <>
      {dialog && createPortal(<DialogCard dialog={dialog} />, document.body)}
      {current && createPortal(<Toast key={current.key} text={current.text} />, document.body)}
    </>
  );
}

function DialogCard({ dialog }: { dialog: Dialog }) {
  const theme = useTheme();
  const confirmRef = useRef<View>(null);

  useEffect(() => {
    (confirmRef.current as unknown as HTMLElement | null)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // capture: before the reader's own shortcuts
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);

  const confirmColor = dialog.destructive ? theme.danger : theme.tint;
  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={() => close(false)} />
      <View
        role="alertdialog"
        aria-modal
        aria-label={dialog.title}
        style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
        <ThemedText type="subtitle" style={styles.title}>
          {dialog.title}
        </ThemedText>
        {dialog.message ? (
          <ThemedText type="small" themeColor="textSecondary">
            {dialog.message}
          </ThemedText>
        ) : null}
        <View style={styles.buttons}>
          {dialog.cancel && (
            <Pressable
              onPress={() => close(false)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                styles.button,
                (pressed || hovered) && { backgroundColor: theme.backgroundElement },
              ]}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Cancel
              </ThemedText>
            </Pressable>
          )}
          <Pressable
            ref={confirmRef}
            onPress={() => close(true)}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              styles.button,
              { backgroundColor: confirmColor },
              (pressed || hovered) && styles.hovered,
            ]}>
            <ThemedText type="smallBold" style={styles.confirmText}>
              {dialog.cancel ? (dialog.confirmText ?? 'OK') : 'OK'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Toast({ text }: { text: string }) {
  const theme = useTheme();
  useEffect(() => {
    const timer = setTimeout(() => {
      shownToast = null;
      emit();
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View style={styles.toastWrap}>
      <View role="status" style={[styles.toast, { backgroundColor: theme.text }]}>
        <ThemedText type="small" style={{ color: theme.background }}>
          {text}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed' as 'absolute',
    inset: 0,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
  },
  title: { fontSize: 20, lineHeight: 26 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.three },
  button: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three + 2,
    borderRadius: 10,
    cursor: 'pointer',
  },
  hovered: { opacity: 0.85 },
  confirmText: { color: '#ffffff' },
  toastWrap: {
    position: 'fixed' as 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.five,
    zIndex: 10001,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  toast: { paddingVertical: Spacing.two + 2, paddingHorizontal: Spacing.three + 2, borderRadius: 999 },
});
