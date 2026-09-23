/**
 * Docs homepage i18n gate — the 28 languages in the homepage menu must have
 * pageMeta + translations covering every `data-i18n` key used by
 * docs/index.html, with no English copy-paste, unexpected writing systems or
 * duplicate keys inside a locale object.
 *
 * Replaces the manual `node scripts/check-homepage-i18n.cjs`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkHomepageI18n, detectDuplicateLocaleKeys } from '../../gates/homepage-i18n.js';

interface Result {
  issues: string[];
  keyCount: number;
  menuLanguages: string[];
  duplicateCount: number;
  scriptMismatchCount: number;
  crossLocaleCopyCount: number;
  untranslatedCount: number;
}

const result = checkHomepageI18n() as Result;
const lines = (items: string[]) => (items.length ? `\n${items.join('\n')}` : 'ok');

describe('docs homepage i18n gate', () => {
  it('reads the key set and language menu from docs/index.html', () => {
    assert.ok(result.keyCount > 0, 'no data-i18n keys found in docs/index.html');
    assert.ok(result.menuLanguages.length > 1, `expected a language menu, got ${result.menuLanguages.length}`);
  });

  it('every menu language is fully translated — 0 issue', () => {
    assert.equal(result.issues.length, 0, lines(result.issues));
  });

  it('no locale object defines the same key twice', () => {
    // Last-wins duplicates silently drop a translation; the parser is
    // self-tested below so a broken parser cannot make this vacuous.
    const duplicates = result.issues.filter((issue) => issue.startsWith('[duplicates]'));
    assert.equal(result.duplicateCount, 0, lines(duplicates));
  });

  it('duplicate-key parser detects a repeated key (keeps the check above honest)', () => {
    const source = `(function(){
  var root = window.DOCUMD_HOMEPAGE_I18N = window.DOCUMD_HOMEPAGE_I18N || {};
  root.translations = root.translations || {};
  root.translations["xx"] = {
    "hero.title": "First wins",
    "hero.sub": "ok",
    "hero.title": "Last wins"
  };
})();`;
    const found = detectDuplicateLocaleKeys(source, 'translations') as Array<{ locale: string; keys: string[] }>;
    assert.equal(found.length, 1);
    assert.equal(found[0].locale, 'xx');
    assert.deepEqual(found[0].keys, ['hero.title']);
  });
});
