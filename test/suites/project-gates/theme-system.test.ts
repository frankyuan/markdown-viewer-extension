/**
 * Theme system gate — registry integrity, config references, font coverage and
 * WCAG contrast for every preset.
 *
 * Rules live in test/gates/theme-system.js; the previous `npm run check:themes`
 * and `check-font-config` scripts were folded into this suite.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkThemeSystem, FAILING_COUNT_BASELINE } from '../../gates/theme-system.js';

interface Warning { kind: string; msg: string }
interface Result {
  errors: string[];
  warnings: Warning[];
  stats: { presets: number; layouts: number; colors: number; tables: number; codeThemes: number; fonts: number } | null;
}

const result = checkThemeSystem() as Result;
const byKind = (kind: string) => result.warnings.filter((w) => w.kind === kind);
const lines = (items: string[]) => (items.length ? `\n${items.join('\n')}` : 'ok');

describe('theme system gate', () => {
  it('loads the full theme registry', () => {
    assert.ok(result.stats, `registry failed to load${lines(result.errors)}`);
    assert.ok(result.stats.presets >= 30, `expected ≥30 presets, got ${result.stats.presets}`);
    assert.ok(result.stats.fonts > 0, 'font-config.json must define fonts');
  });

  it('registry, schema, references and fonts are consistent — 0 error', () => {
    assert.equal(result.errors.length, 0, lines(result.errors));
  });

  it('no orphan theme config (unreferenced layout / color / table / code asset)', () => {
    const orphans = byKind('orphan').map((w) => w.msg);
    assert.equal(orphans.length, 0, lines(orphans));
  });

  it(`known syntax-palette contrast exceptions stay at or below the ${FAILING_COUNT_BASELINE} baseline`, () => {
    // Upstream palettes (GitHub / VSCode / Solarized / Dracula …) ship tokens
    // below AA-large; they are reported, not failed. This ceiling only trips
    // when a change adds *new* low-contrast tokens.
    const contrast = byKind('contrast-baseline');
    assert.ok(
      contrast.length <= FAILING_COUNT_BASELINE,
      `${contrast.length} contrast exceptions, baseline ${FAILING_COUNT_BASELINE}\n${contrast.slice(0, 5).map((w) => w.msg).join('\n')}`,
    );
  });
});
