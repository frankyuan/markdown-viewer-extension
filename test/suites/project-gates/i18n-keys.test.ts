/**
 * Locale gate — every key referenced from code must exist in every locale, and
 * every defined key must be used (or removed). Replaces the manual
 * `node scripts/check-missing-keys.js`; the same module backs the build-time
 * check in chrome/firefox/edge/mobile/vscode builds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkI18nKeys } from '../../gates/i18n-keys.js';

interface Result {
  locales: string[];
  totalKeys: number;
  errors: string[];
  missing: Array<{ key: string; locales: string[] }>;
  unused: string[];
  undefinedKeys: string[];
}

const result = checkI18nKeys() as Result;
const lines = (items: string[]) => (items.length ? `\n${items.join('\n')}` : 'ok');

describe('locale coverage gate', () => {
  it('every locale file parses and defines keys', () => {
    assert.equal(result.errors.length, 0, lines(result.errors));
    assert.ok(result.locales.length >= 10, `expected ≥10 locales, got ${result.locales.length}`);
    assert.ok(result.totalKeys > 0, 'no translation keys found');
  });

  it('no key is missing from any locale', () => {
    const missing = result.missing.map((m) => `${m.key}: ${m.locales.join(', ')}`);
    assert.equal(missing.length, 0, lines(missing));
  });

  it('no code path references a key that no locale defines', () => {
    assert.equal(result.undefinedKeys.length, 0, lines(result.undefinedKeys));
  });

  it('no locale key is dead weight (unused)', () => {
    assert.equal(result.unused.length, 0, lines(result.unused));
  });
});
