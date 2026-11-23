// Translation lookup (Requirements 20.2, 20.3, 20.6). The module does not touch the DOM. The
// caller sets the `lang` attribute of the App document and the Ghost_Window from `language`
// (Requirement 20.4).
import { signal, type ReadonlySignal } from '@preact/signals';
import en from './locales/en.json';
import zhCN from './locales/zh-CN.json';

export type Language = 'en' | 'zh-CN';

/** Every user-facing message key. English is the reference set, so its keys define the type. */
export type MessageKey = keyof typeof en;

/** Values for `{name}` placeholders in a message. */
export type MessageParams = Readonly<Record<string, string | number>>;

type Dictionary = Readonly<Record<string, string | undefined>>;

/** Message dictionaries by language. */
export type Catalogs = Readonly<Record<Language, Dictionary>>;

// Typed against MessageKey so that a key missing from zh-CN.json fails the type check.
const zhCNMessages: Record<MessageKey, string> = zhCN;

const catalogs: Catalogs = { en, 'zh-CN': zhCNMessages };

/** Any browser language tag that begins with "zh" selects Simplified Chinese (Requirement 20.2). */
export function detectLanguage(tag: string | null | undefined): Language {
  return typeof tag === 'string' && tag.trim().toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}

const activeLanguage = signal<Language>(
  detectLanguage(typeof navigator === 'undefined' ? undefined : navigator.language),
);

/** The active language. Reading it inside a component subscribes that component to changes. */
export const language: ReadonlySignal<Language> = activeLanguage;

/** Switches the active language. Components that read `language` re-render without a reload. */
export function setLanguage(next: Language): void {
  activeLanguage.value = next;
}

function lookup(dictionary: Dictionary | undefined, key: string): string | undefined {
  return dictionary !== undefined && Object.hasOwn(dictionary, key) ? dictionary[key] : undefined;
}

function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder: string, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : placeholder,
  );
}

/**
 * Looks up `key` in the dictionary of `lang`. A key missing in that language falls back to
 * English (Requirement 20.6). A key missing in English returns the key itself, so the UI
 * never shows an empty label.
 */
export function translate(
  dictionaries: Catalogs,
  lang: Language,
  key: string,
  params?: MessageParams,
): string {
  const template = lookup(dictionaries[lang], key) ?? lookup(dictionaries.en, key) ?? key;
  return params === undefined ? template : interpolate(template, params);
}

/** Returns the message for `key` in the active language. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(catalogs, activeLanguage.value, key, params);
}

/**
 * Returns the message for `key` in `lang`. Pure code that receives its language explicitly
 * (for example the tab status in src/core) uses this instead of `t`, which reads the active signal.
 */
export function translateIn(lang: Language, key: MessageKey, params?: MessageParams): string {
  return translate(catalogs, lang, key, params);
}
