/**
 * Locale gate — every key that code references must exist in every locale, and
 * every defined key should be used somewhere.
 *
 * Also imported by the platform builds (chrome/firefox/edge/mobile/vscode) so a
 * release build reports the same problems.
 */

import fs from 'node:fs';
import path from 'node:path';
import { findI18nKeysInCode } from '../../scripts/shared/find-i18n-keys-in-code.js';

const LOCALES_DIR = path.join(import.meta.dirname, '../../src/_locales');

function getLocaleDirs() {
  return fs
    .readdirSync(LOCALES_DIR)
    .filter((file) => {
      const fullPath = path.join(LOCALES_DIR, file);
      return fs.statSync(fullPath).isDirectory() && file !== 'node_modules';
    })
    .sort();
}

function loadMessages(locale) {
  try {
    return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
  } catch (error) {
    return { __error: `${locale}/messages.json: ${error.message}` };
  }
}

/**
 * @returns {{
 *   locales: string[],
 *   totalKeys: number,
 *   errors: string[],
 *   missing: Array<{ key: string, locales: string[] }>,
 *   unused: string[],
 *   undefinedKeys: string[],
 * }}
 */
export function checkI18nKeys() {
  const errors = [];
  const missing = [];
  const locales = getLocaleDirs();
  const localeData = new Map();
  const allKeys = new Set();

  for (const locale of locales) {
    const messages = loadMessages(locale);
    if (messages.__error) {
      errors.push(messages.__error);
      continue;
    }
    const keys = Object.keys(messages).sort();
    localeData.set(locale, new Set(keys));
    keys.forEach((key) => allKeys.add(key));
  }

  const allKeysArray = Array.from(allKeys).sort();

  for (const key of allKeysArray) {
    const missingIn = locales.filter((locale) => localeData.has(locale) && !localeData.get(locale).has(key));
    if (missingIn.length > 0) missing.push({ key, locales: missingIn });
  }

  const usedKeys = findI18nKeysInCode();
  const unused = allKeysArray.filter((key) => !usedKeys.all.has(key));
  const undefinedKeys = Array.from(usedKeys.all).filter((key) => !allKeys.has(key)).sort();

  return { locales, totalKeys: allKeysArray.length, errors, missing, unused, undefinedKeys };
}

/** Human-readable report; returns the number of blocking + advisory issues. */
export function printI18nKeyReport(result, log = console.log) {
  const { totalKeys, errors, missing, unused, undefinedKeys } = result;

  for (const e of errors) log(`❌ ${e}`);

  if (missing.length > 0) {
    log('❌ Missing translations:');
    for (const { key, locales } of missing) log(`   ${key}: ${locales.join(', ')}`);
    log('\n🛠️  Fix: node scripts/update-locale-keys.js\n');
  }

  if (unused.length > 0) {
    log(`⚠️  ${unused.length} unused key(s):`);
    for (const key of unused) log(`   ${key}`);
    log('\n🛠️  Fix: node scripts/cleanup-unused-keys.js\n');
  }

  if (undefinedKeys.length > 0) {
    log(`❌ ${undefinedKeys.length} undefined key(s):`);
    for (const key of undefinedKeys) log(`   ${key}`);
    log('\n🛠️  Fix: node scripts/update-locale-keys.js\n');
  }

  if (errors.length + missing.length + unused.length + undefinedKeys.length === 0) {
    log(`✅ All ${totalKeys} translation keys OK\n`);
    return 0;
  }

  log(`📊 ${totalKeys} keys | ${missing.length} missing | ${unused.length} unused | ${undefinedKeys.length} undefined\n`);
  return errors.length + missing.length + undefinedKeys.length;
}
