import { en } from './messages/en';
import { es, type Messages } from './messages/es';
import { fr } from './messages/fr';
import { pt } from './messages/pt';

export type Locale = 'es' | 'en' | 'fr' | 'pt';
export type MessageKey = keyof Messages;
export type Params = Record<string, string | number>;

/** Each language is named in its own language so people can find theirs. */
export const LOCALES: { id: Locale; name: string }[] = [
  { id: 'es', name: 'Español' },
  { id: 'en', name: 'English' },
  { id: 'fr', name: 'Français' },
  { id: 'pt', name: 'Português' },
];

const CATALOGS: Record<Locale, Messages> = { es, en, fr, pt };

let current: Locale = 'es';

export const isLocale = (value: unknown): value is Locale => LOCALES.some((l) => l.id === value);

/** The app starts in Spanish; the choice is saved with the other preferences. */
export const DEFAULT_LOCALE: Locale = 'es';

export const getLocale = () => current;

/** Sets the language used by `t`. The preferences store calls it before re-rendering. */
export const setLocale = (locale: Locale) => {
  current = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
};

const interpolate = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : text;

/**
 * Translated text for a key. `{name}` placeholders take values from `params`. When `params.count` is 1
 * and a `<key>.one` entry exists, that singular form is used.
 */
export const t = (key: MessageKey, params?: Params, locale: Locale = current): string => {
  const catalog = CATALOGS[locale];
  const singular = `${key}.one` as MessageKey;
  const text = params?.count === 1 && singular in catalog ? catalog[singular] : catalog[key];
  return interpolate(text ?? es[key] ?? key, params);
};

/** List of names joined the way each language does it: "a, b y c". */
export const formatList = (items: string[], locale: Locale = current) =>
  new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
