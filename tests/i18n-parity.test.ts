// Translation key parity (Requirements 20.1 and 29.9). The tests call the same comparison
// that `npm.cmd run check:i18n` runs, so the Test_Suite keeps a check that cannot be skipped.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
// The script is plain Node ESM with no .d.mts file (it has no build step), so TypeScript
// reports TS7016 for this import. The suppression covers only this line; the types of the
// exports used here are declared below.
// @ts-expect-error TS7016: scripts/check-i18n.mjs is untyped plain Node ESM
import * as parity from '../scripts/check-i18n.mjs';

interface ProblemEntry {
  file: string;
  missing: string[];
}
interface ComparisonResult {
  ok: boolean;
  problems: ProblemEntry[];
}
interface ParityResult extends ComparisonResult {
  errors: string[];
  keyCount: number;
}
interface ParityModule {
  LOCALE_FILES: string[];
  checkI18nParity(root?: string): ParityResult;
  compareKeySets(locales: Record<string, unknown>): ComparisonResult;
}

const { LOCALE_FILES, checkI18nParity, compareKeySets } = parity as ParityModule;

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const tempRoots: string[] = [];

afterAll(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

/** Copies the real locale files into a temp root, optionally replacing zh-CN.json content. */
function makeLocaleCopy(zhCnOverride?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'i18n-parity-'));
  tempRoots.push(root);
  const dir = join(root, 'src', 'i18n', 'locales');
  mkdirSync(dir, { recursive: true });
  for (const file of LOCALE_FILES) {
    const name = join(dir, file.split('/').pop() as string);
    const text = zhCnOverride !== undefined && name.endsWith('zh-CN.json')
      ? zhCnOverride
      : readFileSync(join(REPO_ROOT, file), 'utf8');
    writeFileSync(name, text, 'utf8');
  }
  return root;
}

describe('translation key parity on the real locale files', () => {
  it('finds identical key sets in en.json and zh-CN.json', () => {
    const result = checkI18nParity(REPO_ROOT);
    expect(result.errors).toEqual([]);
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.keyCount).toBeGreaterThan(0);
  });
});

describe('compareKeySets', () => {
  it('passes when both locales define the same keys', () => {
    const result = compareKeySets({
      'en.json': { 'app.name': 'Spooky', 'app.pitch': 'Boo' },
      'zh-CN.json': { 'app.name': '诡异', 'app.pitch': '嘘' },
    });
    expect(result).toEqual({ ok: true, problems: [] });
  });

  it('reports a key that zh-CN lacks, under zh-CN.json', () => {
    const result = compareKeySets({
      'en.json': { 'app.name': 'Spooky', 'page.status': 'Placeholder' },
      'zh-CN.json': { 'app.name': '诡异' },
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ file: 'zh-CN.json', missing: ['page.status'] }]);
  });

  it('reports an extra key in zh-CN as missing from en.json', () => {
    const result = compareKeySets({
      'en.json': { 'app.name': 'Spooky' },
      'zh-CN.json': { 'app.name': '诡异', 'extra.key': '多余' },
    });
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ file: 'en.json', missing: ['extra.key'] }]);
  });

  it('flattens nested objects so the nested and flat spellings of one key match', () => {
    const result = compareKeySets({
      'en.json': { ui: { title: 'Haunting' } },
      'zh-CN.json': { 'ui.title': '闹鬼' },
    });
    expect(result).toEqual({ ok: true, problems: [] });
  });
});

describe('checkI18nParity on temporary locale copies', () => {
  it('passes for an unchanged copy of the real locale files', () => {
    const result = checkI18nParity(makeLocaleCopy());
    expect(result.ok).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('fails and names the key when the zh-CN copy drops a key', () => {
    const zh = JSON.parse(readFileSync(join(REPO_ROOT, 'src/i18n/locales/zh-CN.json'), 'utf8')) as Record<string, string>;
    const dropped = 'page.status';
    delete zh[dropped];
    const result = checkI18nParity(makeLocaleCopy(JSON.stringify(zh)));
    expect(result.ok).toBe(false);
    expect(result.problems).toEqual([{ file: 'src/i18n/locales/zh-CN.json', missing: [dropped] }]);
  });

  it('reports a locale file that is not valid JSON as an error', () => {
    const result = checkI18nParity(makeLocaleCopy('{ "app.name": '));
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('src/i18n/locales/zh-CN.json');
  });
});
