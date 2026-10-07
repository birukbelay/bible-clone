/**
 * Files out of the app: share a file (expo-sharing), print or save as PDF (expo-print), save text
 * (backups, exported notes), pick a file to read back. expo-sharing and expo-print are optional:
 * without them text is shared as a message and printing reports itself unavailable.
 * The web version (files.web.ts) downloads files and prints with the browser.
 *
 * To enable: bunx expo install expo-sharing expo-print, then rebuild the app.
 */
import { File, Paths } from 'expo-file-system';
import { Platform, Share } from 'react-native';

type ExpoSharing = {
  isAvailableAsync(): Promise<boolean>;
  shareAsync(url: string, options?: { mimeType?: string; dialogTitle?: string; UTI?: string }): Promise<void>;
};

type ExpoPrint = {
  printAsync(options: { html: string }): Promise<void>;
  printToFileAsync(options: { html: string; base64?: boolean }): Promise<{ uri: string }>;
};

/** react-native-view-shot, for verse images (also optional) */
type ViewShot = {
  captureRef(view: unknown, options?: { format?: 'png' | 'jpg'; quality?: number; result?: 'tmpfile' }): Promise<string>;
};

const modules: Record<string, unknown> = {};

function optional<T>(name: 'expo-sharing' | 'expo-print' | 'react-native-view-shot'): T | null {
  if (name in modules) return modules[name] as T | null;
  modules[name] = null;
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    if (name === 'expo-sharing') modules[name] = require('expo-sharing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    else if (name === 'expo-print') modules[name] = require('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional dependency
    else modules[name] = require('react-native-view-shot');
  } catch {
    modules[name] = null;
  }
  return modules[name] as T | null;
}

const sharing = () => optional<ExpoSharing>('expo-sharing');
const print = () => optional<ExpoPrint>('expo-print');

export const fileSharingAvailable = () => sharing() != null;
export const printAvailable = () => print() != null;
export const imageCaptureAvailable = () => optional<ViewShot>('react-native-view-shot') != null;

/** Opens the share sheet for a file (a .db, a backup, a PDF). False when sharing files is not available. */
export async function shareFile(uri: string, mimeType: string, title?: string) {
  const S = sharing();
  if (S && (await S.isAvailableAsync())) {
    await S.shareAsync(uri, { mimeType, dialogTitle: title });
    return true;
  }
  if (Platform.OS === 'ios') {
    // the system share sheet takes file URLs on iOS
    await Share.share({ url: uri, title });
    return true;
  }
  return false;
}

/**
 * "Saves" text as a file: writes it to the cache and opens the share sheet, so it can go to Files,
 * Drive, a messaging app, ... Without expo-sharing on Android the text itself is shared.
 */
export async function saveText(name: string, content: string, mimeType = 'text/plain') {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  if (await shareFile(file.uri, mimeType, name)) return;
  await Share.share({ message: content, title: name });
}

/** Lets the user pick a text file (a backup) and returns its content, or null when cancelled. */
export async function pickText(mimeTypes: string[] = ['application/json', 'text/plain', '*/*']) {
  const picked = await File.pickFileAsync({ mimeTypes });
  if (picked.canceled || !picked.result) return null;
  return picked.result.text();
}

/** Print dialog (with "Save as PDF") for an HTML page. False when printing is not available. */
export async function printHtml(html: string) {
  const P = print();
  if (!P) return false;
  await P.printAsync({ html });
  return true;
}

/** PDF of an HTML page, shared. False when printing is not available. */
export async function sharePdf(html: string, name: string) {
  const P = print();
  if (!P) return false;
  const { uri } = await P.printToFileAsync({ html });
  const target = new File(Paths.cache, name.endsWith('.pdf') ? name : `${name}.pdf`);
  if (target.exists) target.delete();
  await new File(uri).move(target);
  return shareFile(target.uri, 'application/pdf', name);
}

/** What the verse image shows; the web draws it itself from this, phones capture the view. */
export type VerseCard = {
  text: string;
  reference: string;
  background: string;
  color: string;
  /** CSS font family for the web drawing */
  font: string;
  size: number;
};

/** PNG of the verse image card, shared. False when capturing views is not available. */
export async function shareVerseImage(view: unknown, _card: VerseCard, name: string) {
  const V = optional<ViewShot>('react-native-view-shot');
  if (!V) return false;
  const uri = await V.captureRef(view, { format: 'png', quality: 1, result: 'tmpfile' });
  return shareFile(uri.startsWith('file:') ? uri : `file://${uri}`, 'image/png', name);
}
