/**
 * Settings centralization gate — settings-schema.json is the only place a
 * default may be defined.
 *
 * 1. the generated TS/Dart files must match a fresh regeneration
 * 2. no consumer may hardcode an enum/boolean default that differs from the
 *    schema default (deliberate platform defaults live in the ALLOWLIST)
 *
 * The check regenerates the codegen files in memory and restores them, so this
 * test never leaves the working tree modified.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkSettingsSchema } from '../../gates/settings-schema.js';

interface Result {
  errors: string[];
  warnings: string[];
  stats: { patterns: number; allowlist: number; allowlistHit: number };
}

const result = checkSettingsSchema() as Result;
const lines = (items: string[]) => (items.length ? `\n${items.join('\n')}` : 'ok');

describe('settings schema gate', () => {
  it('generated TS/Dart defaults match settings-schema.json', () => {
    const stale = result.errors.filter((e) => e.includes('out of date'));
    assert.equal(stale.length, 0, lines(stale));
  });

  it('no consumer hardcodes a setting default — 0 error', () => {
    assert.equal(result.errors.length, 0, lines(result.errors));
  });

  it('every ALLOWLIST exemption still matches a real default', () => {
    // A line-number-based list once rotted here and silently disarmed the gate,
    // which is why entries are matched by file + key and reported when stale.
    assert.equal(result.warnings.length, 0, lines(result.warnings));
  });
});
