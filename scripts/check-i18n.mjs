#!/usr/bin/env node
// Translation key parity check (Requirements 20.1 and 29.9).
// Every locale file must define the same key set, so no key is missing in one language.
// Run with `npm.cmd run check:i18n`. Uses only Node built-ins.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Locale files that must define identical key sets, relative to the repository root.
export const LOCALE_FILES = ['src/i18n/locales/en.json', 'src/i18n/locales/zh-CN.json'];

/**
 * Returns the keys of a parsed locale object. A nested object is flattened into
 * dot-separated keys, so `{ "ui": { "title": "x" } }` yields `ui.title`.
 */
export function collectKeys(value, prefix = '') {
  const keys = [];
  for (const [name, child] of Object.entries(value)) {
    const key = prefix === '' ? name : `${prefix}.${name}`;
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      keys.push(...collectKeys(child, key));
    } else {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Compares the key sets of the given locales. `locales` maps a file label to its parsed
 * JSON. A key that any locale defines must exist in every locale.
 * Returns `{ ok, problems }`, where each problem is `{ file, missing }` with the sorted keys
 * that `file` lacks. Pure function: it reads no files.
 */
export function compareKeySets(locales) {
  const keySets = new Map();
  const allKeys = new Set();
  for (const [file, data] of Object.entries(locales)) {
    const keys = new Set(collectKeys(data));
    keySets.set(file, keys);
    for (const key of keys) {
      allKeys.add(key);
    }
  }

  const problems = [];
  for (const [file, keys] of keySets) {
    const missing = [...allKeys].filter((key) => !keys.has(key)).sort();
    if (missing.length > 0) {
      problems.push({ file, missing });
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Reads every file in LOCALE_FILES under `root` and compares the key sets.
 * Returns `{ ok, errors, problems, keyCount }`. `errors` lists files that cannot be read or parsed.
 */
export function checkI18nParity(root = REPO_ROOT) {
  const errors = [];
  const locales = {};
  for (const file of LOCALE_FILES) {
    try {
      // Strip a byte-order mark, which some Windows editors add, before parsing.
      const text = readFileSync(join(root, file), 'utf8').replace(/^\uFEFF/, '');
      locales[file] = JSON.parse(text);
    } catch (error) {
      errors.push(`${file} cannot be read as JSON: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors, problems: [], keyCount: 0 };
  }

  const { ok, problems } = compareKeySets(locales);
  const keyCount = Math.max(...Object.values(locales).map((data) => collectKeys(data).length));
  return { ok, errors, problems, keyCount };
}

function main() {
  const { ok, errors, problems, keyCount } = checkI18nParity(REPO_ROOT);

  for (const error of errors) {
    console.error(`ERROR ${error}`);
  }
  for (const { file, missing } of problems) {
    console.error(`FAIL  ${file} is missing ${missing.length} key(s) that another locale file defines:`);
    for (const key of missing) {
      console.error(`        - ${key}`);
    }
  }

  if (!ok || errors.length > 0) {
    console.error('Translation key parity check failed.');
    process.exit(1);
  }
  console.log(`Translation key parity check passed: ${keyCount} keys in each of ${LOCALE_FILES.length} locale files.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
