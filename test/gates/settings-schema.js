/**
 * Settings centralization gate (settings-schema.json is the single source of truth).
 *
 * Checks:
 *   1. Generated files (src/config/settings.generated.ts,
 *      mobile/lib/config/settings_defaults.g.dart) are up to date — regenerates
 *      in memory, diffs, and restores the on-disk content.
 *   2. No hardcoded setting defaults in consumer code: every platform storage
 *      layer / webview / exporter / CLI must read defaults from the schema
 *      (DEFAULT_SETTINGS / DEFAULT_RENDER_SETTINGS / normalizeSetting / Dart
 *      constants).
 *
 * Enum/boolean literals that differ from the schema default are drift, unless
 * listed in ALLOWLIST as a deliberate platform default. Type annotations
 * (`'left' | 'center'`) are ignored, as are tests and generated files.
 *
 * Consumed by test/suites/project-gates/settings-schema.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import syncSettings from '../../scripts/sync-settings.js';

const projectRoot = path.join(import.meta.dirname, '../..');

/**
 * Deliberate defaults that intentionally differ from the schema default.
 * Matched by file + key (line numbers drift and silently disarm the gate).
 */
const ALLOWLIST = [
  { file: 'src/cli/browser-renderer.ts', key: 'tableMergeEmpty', reason: 'CLI default: no table cell merging' },
  { file: 'src/core/markdown-processor.ts', key: 'tableMergeEmpty', reason: 'processor param default: caller passes the value' },
  { file: 'src/core/viewer/viewer-controller.ts', key: 'tableMergeEmpty', reason: 'render option default: caller passes the value' },
  { file: 'scripts/md-to-html.js', key: 'tableMergeEmpty', reason: 'CLI default: no table cell merging' },
];

const SCAN_DIRS = [
  'src',
  'vscode/src',
  'obsidian/src',
  'chrome/src',
  'firefox/src',
  'edge/src',
  'mobile/src',
  'mobile/lib',
  'scripts',
];

const SKIP_PATHS = [
  'src/config/settings.generated.ts',
  'mobile/lib/config/settings_defaults.g.dart',
  'test/gates/settings-schema.js', // this file itself contains patterns in comments
  'node_modules',
  'mobile/build',
  'dist',
  'temp',
  /test\//,
  /plans\//,
  /\.github\//,
];

function shouldSkip(absPath) {
  const rel = path.relative(projectRoot, absPath);
  return SKIP_PATHS.some((p) => (typeof p === 'string' ? rel.includes(p) : p.test(rel)));
}

/** Build detection patterns from the schema (enum/boolean only). */
function buildPatterns() {
  const schema = JSON.parse(fs.readFileSync(path.join(projectRoot, 'settings-schema.json'), 'utf8'));
  const patterns = [];
  for (const s of schema.settings) {
    if (s.cliOnly || (s.type !== 'enum' && s.type !== 'boolean')) continue;
    const def = String(s.default);
    const candidates = s.type === 'enum' ? s.values : ['true', 'false'];
    for (const v of candidates) {
      if (v === def) continue; // default literals are harmless (same value)
      // Matches `key: 'v'` / `key = 'v'` / `key ?? 'v'` / `key || 'v'`
      const lit = s.type === 'boolean' ? v : `'${v}'`;
      const esc = lit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push({ key: s.key, value: v, regex: new RegExp(`${s.key}\\s*(?::\\s*|=\\s*|\\?\\?\\s*|\\|\\|\\s*)${esc}`) });
    }
  }
  return patterns;
}

function isTypeAnnotation(line) {
  // `imageLayout?: 'left' | 'center'` or `key: 'a' | 'b'` — type unions
  return /['"][^'"]*['"]\s*\|/.test(line) || /^\s*[a-zA-Z]+\??:\s*'/.test(line);
}

export function checkSettingsSchema() {
  const errors = [];
  const warnings = [];

  // ---- 1. generated files up to date? ----
  const generated = ['src/config/settings.generated.ts', 'mobile/lib/config/settings_defaults.g.dart'];
  const before = new Map(generated.map((p) => [p, fs.readFileSync(path.join(projectRoot, p), 'utf8')]));

  const log = console.log;
  console.log = () => {}; // syncSettings is chatty; the diff is what matters here
  let changed;
  try {
    changed = syncSettings();
  } finally {
    console.log = log;
  }

  if (changed) {
    errors.push(
      'Generated files are out of date with settings-schema.json. ' +
      'Run `node scripts/sync-settings.js` and commit the regenerated files.'
    );
  }
  // the check must never modify the working tree
  for (const [p, content] of before) fs.writeFileSync(path.join(projectRoot, p), content, 'utf8');

  // ---- 2. hardcoded defaults in consumer code? ----
  const patterns = buildPatterns();
  const hitAllowlist = new Set();

  function checkFile(absPath) {
    const rel = path.relative(projectRoot, absPath);
    const lines = fs.readFileSync(absPath, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (isTypeAnnotation(line)) return;
      for (const { key, value, regex } of patterns) {
        if (!regex.test(line)) continue;
        const allow = ALLOWLIST.find((a) => a.file === rel && a.key === key);
        if (allow) {
          hitAllowlist.add(`${rel}:${key}`);
          break;
        }
        errors.push(
          `Hardcoded default for '${key}' (='${value}') at ${rel}:${i + 1}: ${line.trim()}` +
          ` — use DEFAULT_SETTINGS / normalizeSetting instead`
        );
        break;
      }
    });
  }

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkip(abs)) walk(abs);
      } else if (/\.(ts|js|dart)$/.test(entry.name) && !shouldSkip(abs)) {
        checkFile(abs);
      }
    }
  }

  for (const dir of SCAN_DIRS) walk(path.join(projectRoot, dir));

  // A stale allowlist entry is drift too: the code it justified is gone.
  for (const { file, key } of ALLOWLIST) {
    if (!hitAllowlist.has(`${file}:${key}`)) warnings.push(`ALLOWLIST entry no longer matched: ${file} (${key})`);
  }

  return {
    errors,
    warnings,
    stats: { patterns: patterns.length, allowlist: ALLOWLIST.length, allowlistHit: hitAllowlist.size },
  };
}
