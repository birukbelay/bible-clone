/**
 * Dates in the Gregorian or the Ethiopian calendar. The Ethiopian conversion is plain arithmetic
 * (Hermes' Intl has no Ethiopic calendar on every phone), month and weekday names are built in.
 */
import { useSyncExternalStore } from 'react';

import { dateLocale, resolveLanguage, useLanguage, type Language } from '@/i18n';
import { settings } from '@/settings';

export type Calendar = 'gregorian' | 'ethiopian';
export type CalendarChoice = 'auto' | Calendar;

/** 'auto': Ethiopian when the app is in Amharic. */
export function resolveCalendar(choice: CalendarChoice, language: Language): Calendar {
  return choice === 'auto' ? (language === 'am' ? 'ethiopian' : 'gregorian') : choice;
}

export type EthiopianDate = { year: number; month: number; day: number };

/** Local date of `time` in the Ethiopian calendar (month 13 is Pagume, 5 or 6 days). */
export function toEthiopian(time: number): EthiopianDate {
  const d = new Date(time);
  const a = Math.floor((14 - (d.getMonth() + 1)) / 12);
  const y = d.getFullYear() + 4800 - a;
  const m = d.getMonth() + 1 + 12 * a - 3;
  const jdn = d.getDate() + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  // days since the Ethiopian epoch, in 4-year cycles that end with the leap year
  const c = jdn - 1723856;
  const r = ((c % 1461) + 1461) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  return {
    year: 4 * Math.floor(c / 1461) + Math.floor(r / 365) - Math.floor(r / 1460),
    month: Math.floor(n / 30) + 1,
    day: (n % 30) + 1,
  };
}

const ETH_MONTHS: Record<Language, string[]> = {
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'],
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
};

/** Sunday first, like Date.getDay(). */
const WEEKDAYS: Record<Language, string[]> = {
  am: ['እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** What to show: "Wed, Sep 11" is { weekday, day, month: 'short' }. */
export type DateStyle = { weekday?: boolean; day?: boolean; month?: 'short' | 'long'; year?: boolean };

export function formatDate(time: number, style: DateStyle, language: Language, calendar: Calendar) {
  if (calendar === 'gregorian') {
    return new Date(time).toLocaleDateString(dateLocale(language), {
      weekday: style.weekday ? 'short' : undefined,
      day: style.day ? 'numeric' : undefined,
      month: style.month,
      year: style.year ? 'numeric' : undefined,
    });
  }
  const e = toEthiopian(time);
  const name = ETH_MONTHS[language][e.month - 1];
  const month = style.month === 'short' && language === 'en' ? name.slice(0, 3) : name;
  let text = [style.month ? month : '', style.day ? `${e.day}` : ''].filter(Boolean).join(' ');
  if (style.year) text = `${text}${style.day && language === 'en' ? ',' : ''} ${e.year} ${language === 'am' ? 'ዓ.ም.' : 'EC'}`.trim();
  if (style.weekday) text = `${WEEKDAYS[language][new Date(time).getDay()]}${language === 'am' ? '፣' : ','} ${text}`;
  return text;
}

/** Year and month of `time` as one number (202409), to tell when a new month starts. */
export function monthKey(time: number, calendar: Calendar) {
  if (calendar === 'ethiopian') {
    const e = toEthiopian(time);
    return e.year * 100 + e.month;
  }
  const d = new Date(time);
  return d.getFullYear() * 100 + d.getMonth() + 1;
}

export type Dates = {
  calendar: Calendar;
  format(time: number, style: DateStyle): string;
  monthKey(time: number): number;
};

function dates(language: Language, calendar: Calendar): Dates {
  return {
    calendar,
    format: (time, style) => formatDate(time, style, language, calendar),
    monthKey: (time) => monthKey(time, calendar),
  };
}

/** Date formatting in the app's language and the chosen calendar. */
export function useDates(): Dates {
  const language = useLanguage();
  const choice = useSyncExternalStore(settings.calendar.subscribe, settings.calendar.get, settings.calendar.get);
  return dates(language, resolveCalendar(choice, language));
}

/** For code outside components (notifications). */
export function currentDates() {
  const language = resolveLanguage();
  return dates(language, resolveCalendar(settings.calendar.get(), language));
}
