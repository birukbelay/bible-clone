/**
 * Language of the app's own buttons and labels (the Bible text comes from each version).
 * The English text is the key: t('Search') -> 'ፈልግ'. Missing translations fall back to English.
 * `{name}` placeholders are filled from `vars`.
 */
import { settings, useSetting } from '@/settings';

import { am } from './i18n-am';

export type Language = 'en' | 'am';

export const LANGUAGES: { value: 'system' | Language; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'en', label: 'English' },
  { value: 'am', label: 'አማርኛ' },
];

const dictionaries: Record<Language, Record<string, string>> = { en: {}, am };

function systemLanguage(): Language {
  let locale = '';
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
  } catch {}
  if (!locale && typeof navigator !== 'undefined') locale = navigator.language ?? '';
  return locale.toLowerCase().startsWith('am') ? 'am' : 'en';
}

export function resolveLanguage(choice = settings.language.get()): Language {
  return choice === 'system' ? systemLanguage() : choice;
}

export type Vars = Record<string, string | number>;

export function translate(language: Language, key: string, vars?: Vars) {
  const text = dictionaries[language][key] ?? key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}

/** For code outside components (dialogs, notifications); components use useT() so they re-render. */
export function t(key: string, vars?: Vars) {
  return translate(resolveLanguage(), key, vars);
}

/** Locale for dates and numbers. */
export function dateLocale(language = resolveLanguage()) {
  return language === 'am' ? 'am-ET' : undefined;
}

export function useLanguage(): Language {
  const [choice] = useSetting(settings.language);
  return resolveLanguage(choice);
}

export function useT() {
  const language = useLanguage();
  return (key: string, vars?: Vars) => translate(language, key, vars);
}

export type T = ReturnType<typeof useT>;
