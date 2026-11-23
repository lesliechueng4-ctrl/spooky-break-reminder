// Language detection, lookup, English fallback and placeholders (Requirements 20.2, 20.3, 20.6).
import { computed } from '@preact/signals';
import { afterEach, describe, expect, it } from 'vitest';
import en from '../src/i18n/locales/en.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import {
  type Catalogs,
  type MessageKey,
  detectLanguage,
  language,
  setLanguage,
  t,
  translate,
} from '../src/i18n';

const keys = Object.keys(en) as MessageKey[];

afterEach(() => {
  setLanguage('en');
});

describe('detectLanguage', () => {
  it.each(['zh', 'zh-CN', 'zh-TW', 'zh-Hant-HK', 'ZH-cn'])('maps %s to zh-CN', (tag) => {
    expect(detectLanguage(tag)).toBe('zh-CN');
  });

  it.each(['en', 'en-US', 'fr-FR', 'xzh-CN', ''])('maps %s to en', (tag) => {
    expect(detectLanguage(tag)).toBe('en');
  });

  it('maps a missing language to en', () => {
    expect(detectLanguage(null)).toBe('en');
    expect(detectLanguage(undefined)).toBe('en');
  });
});

describe('t and the active language', () => {
  it('returns the English text for every key in English', () => {
    setLanguage('en');
    for (const key of keys) {
      expect(t(key)).toBe(en[key]);
    }
  });

  it('returns the Simplified Chinese text for every key in zh-CN', () => {
    setLanguage('zh-CN');
    expect(language.value).toBe('zh-CN');
    for (const key of keys) {
      expect(t(key)).toBe(zhCN[key]);
    }
  });

  it('re-evaluates a computed message after the language changes', () => {
    const label = computed(() => t('app.name'));
    expect(label.value).toBe(en['app.name']);
    setLanguage('zh-CN');
    expect(label.value).toBe(zhCN['app.name']);
    setLanguage('en');
    expect(label.value).toBe(en['app.name']);
  });
});

describe('translate fallback', () => {
  const catalogs: Catalogs = {
    en: { greet: 'Hello', 'only.en': 'English only' },
    'zh-CN': { greet: '你好' },
  };

  it('returns the active-language text when it exists', () => {
    expect(translate(catalogs, 'zh-CN', 'greet')).toBe('你好');
    expect(translate(catalogs, 'en', 'greet')).toBe('Hello');
  });

  it('falls back to the English text when the active language lacks the key', () => {
    expect(translate(catalogs, 'zh-CN', 'only.en')).toBe('English only');
  });

  it('returns the key when no language has it', () => {
    expect(translate(catalogs, 'zh-CN', 'missing.key')).toBe('missing.key');
  });

  it('does not treat inherited object properties as messages', () => {
    expect(translate(catalogs, 'en', 'toString')).toBe('toString');
    expect(translate(catalogs, 'zh-CN', 'constructor')).toBe('constructor');
  });
});

describe('placeholders', () => {
  const catalogs: Catalogs = {
    en: { overdue: 'Overdue for {minutes} min by {name}, {minutes} in all' },
    'zh-CN': {},
  };

  it('replaces every named placeholder, including repeated ones', () => {
    expect(translate(catalogs, 'en', 'overdue', { minutes: 6, name: 'Ann' })).toBe(
      'Overdue for 6 min by Ann, 6 in all',
    );
  });

  it('leaves a placeholder without a matching parameter in place', () => {
    expect(translate(catalogs, 'en', 'overdue', { name: 'Ann' })).toBe(
      'Overdue for {minutes} min by Ann, {minutes} in all',
    );
  });

  it('inserts parameter values literally, without replacement patterns', () => {
    expect(translate(catalogs, 'en', 'overdue', { minutes: '$&', name: '$1' })).toBe(
      'Overdue for $& min by $1, $& in all',
    );
  });
});
