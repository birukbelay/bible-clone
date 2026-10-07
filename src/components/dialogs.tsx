/**
 * Confirmations, messages and sharing. iOS / Android: the system Alert and share sheet.
 * The web version (dialogs.web.tsx) draws its own dialog, since react-native-web's Alert does nothing.
 */
import { Alert, Share } from 'react-native';

import { t } from '@/i18n';

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** label of the confirm button (default "OK") */
  confirmText?: string;
  destructive?: boolean;
};

/** Resolves true when the user confirms. */
export function confirm({ title, message, confirmText = t('OK'), destructive }: ConfirmOptions) {
  return new Promise<boolean>((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: t('Cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    ),
  );
}

export function notify(title: string, message?: string) {
  Alert.alert(title, message);
}

/** `notify` for a failed action: `promise.catch(showError('Could not save'))`. */
export function showError(title: string) {
  return (e: unknown) => notify(title, e instanceof Error ? t(e.message) : String(e));
}

/** Short note at the bottom of the page on the web; phones show their own clipboard notice. */
export function toast(_text: string) {}

export async function share(message: string) {
  await Share.share({ message });
}

/** Renders the web dialogs; nothing on iOS / Android. */
export function DialogHost() {
  return null;
}
