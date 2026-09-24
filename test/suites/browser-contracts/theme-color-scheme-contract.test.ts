/**
 * Theme-following color-scheme contract.
 *
 * The takeover page preloads `:root { color-scheme: light dark }` so the boot
 * canvas matches the OS (no white flash before the theme CSS arrives). Once the
 * theme is applied the viewer paints every colour itself, so the used
 * color-scheme must follow the THEME classes instead: leaving it to the OS
 * makes the UA paint native widgets from the OS palette — on a light theme in
 * dark mode that is a near-black task-list checkbox whose check mark is a
 * barely lighter gray (issue #131). `only` additionally opts the content out of
 * UA forced-darkening, since the theme already decides light vs dark.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const STYLES = fs.readFileSync(path.resolve('src/ui/styles.css'), 'utf8');
const PRELOAD = fs.readFileSync(path.resolve('chrome/src/webview/content-detector.ts'), 'utf8');
const THEME_CSS_SOURCE = fs.readFileSync(path.resolve('src/utils/theme-to-css.ts'), 'utf8');

describe('color-scheme follows the theme', () => {
  it('pins the light theme to an explicitly light scheme', () => {
    assert.match(
      STYLES,
      /:root\.light\s*\{[^}]*color-scheme:\s*only light/,
      ':root.light must override the preload declaration with the theme scheme',
    );
  });

  it('pins the dark theme to an explicitly dark scheme', () => {
    assert.match(
      STYLES,
      /:root\.dark\s*\{[^}]*color-scheme:\s*only dark/,
      ':root.dark must override the preload declaration with the theme scheme',
    );
  });

  it('keeps the boot preload on the OS scheme', () => {
    // The preload paints the canvas before any theme CSS exists; it must stay
    // OS-driven, and the theme classes above take over afterwards.
    assert.match(PRELOAD, /:root \{ color-scheme: light dark; \}/);
  });

  it('toggles the theme classes on the document root', () => {
    // The rules above are only reachable when loadAndApplyTheme marks the root
    // with the theme's scheme.
    assert.match(THEME_CSS_SOURCE, /root\.classList\.toggle\('dark', colorSchema === 'dark'\)/);
    assert.match(THEME_CSS_SOURCE, /root\.classList\.toggle\('light', colorSchema !== 'dark'\)/);
  });
});
