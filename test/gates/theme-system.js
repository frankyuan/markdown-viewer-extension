/**
 * Theme system gate — structural integrity + WCAG contrast.
 *
 * Checks:
 *   1. registry.json structure and required fields
 *   2. preset / layout / color / table / code / font config file existence
 *   3. duplicate ids
 *   4. registry entries reference existing preset files
 *   5. every preset references existing layout / color / table / code configs
 *   6. every font used by a preset exists in font-config.json
 *   7. orphan / unreferenced configs (warning)
 *   8. core WCAG contrast (body / link / table header / code foreground / alert titles)
 *
 * Consumed by test/suites/project-gates/theme-system.test.ts.
 */

import fs from 'node:fs';
import path from 'node:path';

const THEMES_ROOT = path.join(import.meta.dirname, '../../src/themes');
const PRESETS_DIR = path.join(THEMES_ROOT, 'presets');
const LAYOUT_DIR = path.join(THEMES_ROOT, 'layout-schemes');
const COLOR_DIR = path.join(THEMES_ROOT, 'color-schemes');
const TABLE_DIR = path.join(THEMES_ROOT, 'table-styles');
const CODE_DIR = path.join(THEMES_ROOT, 'code-themes');
const FONT_CONFIG_PATH = path.join(THEMES_ROOT, 'font-config.json');
const REGISTRY_PATH = path.join(THEMES_ROOT, 'registry.json');

export const FAILING_COUNT_BASELINE = 285;

/**
 * Assets deliberately kept although no preset references them yet (print /
 * accessibility variants). Everything else must be reachable from registry.json;
 * an exemption that stops being needed is reported so this list cannot rot.
 */
const INTENTIONAL_UNREFERENCED = new Set(['table-style high-contrast']);

// ============================================================================
// WCAG contrast
// ============================================================================

function parseColor(input) {
  if (!input || typeof input !== 'string') return null;
  const s = input.trim();
  let m = s.match(/^#([0-9a-fA-F]{3})$/);
  if (m) {
    return {
      r: parseInt(m[1][0] + m[1][0], 16),
      g: parseInt(m[1][1] + m[1][1], 16),
      b: parseInt(m[1][2] + m[1][2], 16),
      alpha: 1,
    };
  }
  m = s.match(/^#([0-9a-fA-F]{6})$/);
  if (m) {
    return {
      r: parseInt(s.slice(1, 3), 16),
      g: parseInt(s.slice(3, 5), 16),
      b: parseInt(s.slice(5, 7), 16),
      alpha: 1,
    };
  }
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    return {
      r: parseInt(m[1]),
      g: parseInt(m[2]),
      b: parseInt(m[3]),
      alpha: m[4] !== undefined ? parseFloat(m[4]) : 1,
    };
  }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  return null;
}

function srgbToLinear(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(color) {
  if (!color) return 0;
  const r = srgbToLinear(color.r / 255);
  const g = srgbToLinear(color.g / 255);
  const b = srgbToLinear(color.b / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function blendOver(fg, bg) {
  if (!fg) return bg;
  if (!bg) return fg;
  const a = fg.alpha !== undefined ? fg.alpha : 1;
  if (a >= 1) return { r: fg.r, g: fg.g, b: fg.b, alpha: 1 };
  const bgAlpha = bg.alpha !== undefined ? bg.alpha : 1;
  const outAlpha = a + bgAlpha * (1 - a);
  if (outAlpha <= 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const r = (fg.r * a + bg.r * bgAlpha * (1 - a)) / outAlpha;
  const g = (fg.g * a + bg.g * bgAlpha * (1 - a)) / outAlpha;
  const b = (fg.b * a + bg.b * bgAlpha * (1 - a)) / outAlpha;
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b), alpha: outAlpha };
}

function contrastRatio(fg, bg) {
  const fgResolved = blendOver(fg, bg);
  const L1 = relativeLuminance(fgResolved);
  const L2 = relativeLuminance(bg);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ============================================================================
// Schema validation
// ============================================================================

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

export function checkThemeSystem() {
  const errors = [];
  const warnings = [];
  const err = (msg) => errors.push(msg);
  // contrast-warnings are a tracked baseline (upstream syntax palettes); the
  // other kinds are actionable drift and must stay at zero.
  const warn = (kind, msg) => warnings.push({ kind, msg });

  const readJSON = (p) => {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      err(`无法解析 JSON: ${p} (${e.message})`);
      return null;
    }
  };
  const listJsonFiles = (dir) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

  function validatePreset(preset, file) {
    if (!preset) return;
    const id = file.replace(/\.json$/, '');
    if (!isNonEmptyString(preset.id)) err(`preset ${file}: 缺少 id`);
    else if (preset.id !== id) err(`preset ${file}: id "${preset.id}" 与文件名 "${id}" 不一致`);
    if (!isNonEmptyString(preset.name)) err(`preset ${file}: 缺少 name`);
    if (!preset.fontScheme || typeof preset.fontScheme !== 'object') err(`preset ${file}: 缺少 fontScheme`);
    if (!preset.fontScheme?.body?.fontFamily) err(`preset ${file}: 缺少 fontScheme.body.fontFamily`);
    if (!preset.fontScheme?.code?.fontFamily) err(`preset ${file}: 缺少 fontScheme.code.fontFamily`);
    if (!isNonEmptyString(preset.layoutScheme)) err(`preset ${file}: 缺少 layoutScheme`);
    if (!isNonEmptyString(preset.colorScheme)) err(`preset ${file}: 缺少 colorScheme`);
    if (!isNonEmptyString(preset.tableStyle)) err(`preset ${file}: 缺少 tableStyle`);
    if (!isNonEmptyString(preset.codeTheme)) err(`preset ${file}: 缺少 codeTheme`);
  }

  function validateLayout(layout, file) {
    if (!layout) return;
    const id = file.replace(/\.json$/, '');
    if (!isNonEmptyString(layout.id)) err(`layout ${file}: 缺少 id`);
    else if (layout.id !== id) err(`layout ${file}: id "${layout.id}" 与文件名 "${id}" 不一致`);
    if (!layout.body || typeof layout.body.fontSize !== 'string' || typeof layout.body.lineHeight !== 'number') {
      err(`layout ${file}: body.fontSize / body.lineHeight 非法`);
    }
    if (!layout.headings || typeof layout.headings !== 'object') err(`layout ${file}: 缺少 headings`);
    if (!layout.blocks || typeof layout.blocks !== 'object') err(`layout ${file}: 缺少 blocks`);
  }

  function validateColorScheme(cs, file) {
    if (!cs) return;
    const id = file.replace(/\.json$/, '');
    if (!isNonEmptyString(cs.id)) err(`color-scheme ${file}: 缺少 id`);
    else if (cs.id !== id) err(`color-scheme ${file}: id "${cs.id}" 与文件名 "${id}" 不一致`);
    if (!cs.text || !cs.text.primary) err(`color-scheme ${file}: 缺少 text.primary`);
    if (!cs.accent || !cs.accent.link) err(`color-scheme ${file}: 缺少 accent.link`);
    if (!cs.background || !cs.background.code) err(`color-scheme ${file}: 缺少 background.code`);
    if (!cs.table || !cs.table.border) err(`color-scheme ${file}: 缺少 table.border`);
  }

  function validateTableStyle(ts, file) {
    if (!ts) return;
    const id = file.replace(/\.json$/, '');
    if (!isNonEmptyString(ts.id)) err(`table-style ${file}: 缺少 id`);
    else if (ts.id !== id) err(`table-style ${file}: id "${ts.id}" 与文件名 "${id}" 不一致`);
    if (!ts.cell || typeof ts.cell.padding !== 'string') err(`table-style ${file}: 缺少 cell.padding`);
  }

  function validateCodeTheme(ct, file) {
    if (!ct) return;
    const id = file.replace(/\.json$/, '');
    if (!isNonEmptyString(ct.id)) err(`code-theme ${file}: 缺少 id`);
    else if (ct.id !== id) err(`code-theme ${file}: id "${ct.id}" 与文件名 "${id}" 不一致`);
    if (!ct.colors || typeof ct.colors !== 'object') err(`code-theme ${file}: 缺少 colors`);
    if (ct.foreground !== undefined && typeof ct.foreground !== 'string') err(`code-theme ${file}: foreground 非法`);
  }

  // ---- 1. font-config.json ----
  const fontConfig = readJSON(FONT_CONFIG_PATH);
  if (!fontConfig) err('font-config.json 无法加载');
  const configuredFonts = new Set(fontConfig ? Object.keys(fontConfig.fonts || {}) : []);

  // ---- 2. registry.json ----
  const registry = readJSON(REGISTRY_PATH);
  if (!registry) return { errors, warnings, stats: null };
  if (!Array.isArray(registry.themes)) {
    err('registry.json: themes 必须是数组');
    return { errors, warnings, stats: null };
  }
  if (!registry.categories || typeof registry.categories !== 'object') {
    err('registry.json: 缺少 categories 对象');
  }

  // ---- 3. collect config files ----
  const presetFiles = listJsonFiles(PRESETS_DIR);
  const layoutFiles = listJsonFiles(LAYOUT_DIR);
  const colorFiles = listJsonFiles(COLOR_DIR);
  const tableFiles = listJsonFiles(TABLE_DIR);
  const codeFiles = listJsonFiles(CODE_DIR);

  const loadAll = (dir, files, validate, label) => {
    const ids = new Set();
    const map = new Map();
    for (const f of files) {
      const cfg = readJSON(path.join(dir, f));
      validate(cfg, f);
      if (cfg) {
        if (ids.has(cfg.id)) err(`${label} id 重复: ${cfg.id}`);
        ids.add(cfg.id);
        map.set(cfg.id, cfg);
      }
    }
    return { ids, map };
  };

  // ---- 4-5. load and validate every config type ----
  const { ids: presetIds, map: presets } = loadAll(PRESETS_DIR, presetFiles, validatePreset, 'preset');
  const { ids: layoutIds } = loadAll(LAYOUT_DIR, layoutFiles, validateLayout, 'layout');
  const { ids: colorIds, map: colors } = loadAll(COLOR_DIR, colorFiles, validateColorScheme, 'color-scheme');
  const { ids: tableIds } = loadAll(TABLE_DIR, tableFiles, validateTableStyle, 'table-style');
  const { ids: codeIds, map: codeThemes } = loadAll(CODE_DIR, codeFiles, validateCodeTheme, 'code-theme');

  // ---- 6. registry entries ----
  const registryPresetIds = new Set();
  for (const entry of registry.themes) {
    if (!entry || typeof entry !== 'object') {
      err('registry.json: themes 条目必须是对象');
      continue;
    }
    if (!isNonEmptyString(entry.id)) err('registry.json: 条目缺少 id');
    if (!isNonEmptyString(entry.file)) err(`registry 条目 ${entry.id}: 缺少 file`);
    if (!isNonEmptyString(entry.category)) err(`registry 条目 ${entry.id}: 缺少 category`);
    if (entry.id) registryPresetIds.add(entry.id);
    if (entry.file && !presetFiles.includes(entry.file)) {
      err(`registry 条目 ${entry.id}: 引用的 preset 文件 ${entry.file} 不存在`);
    }
    if (entry.category && registry.categories && !registry.categories[entry.category]) {
      err(`registry 条目 ${entry.id}: category "${entry.category}" 在 categories 中未定义`);
    }
  }

  // ---- 7. orphan presets ----
  for (const id of presetIds) {
    if (!registryPresetIds.has(id)) warn('orphan', `preset ${id} 存在但未在 registry.json 中注册`);
  }

  // ---- 8. preset references exist ----
  const usedLayouts = new Set();
  const usedColors = new Set();
  const usedTables = new Set();
  const usedCodes = new Set();

  for (const [id, preset] of presets) {
    if (preset.layoutScheme) {
      usedLayouts.add(preset.layoutScheme);
      if (!layoutIds.has(preset.layoutScheme)) err(`preset ${id}: layoutScheme "${preset.layoutScheme}" 不存在`);
    }
    if (preset.colorScheme) {
      usedColors.add(preset.colorScheme);
      if (!colorIds.has(preset.colorScheme)) err(`preset ${id}: colorScheme "${preset.colorScheme}" 不存在`);
    }
    if (preset.tableStyle) {
      usedTables.add(preset.tableStyle);
      if (!tableIds.has(preset.tableStyle)) err(`preset ${id}: tableStyle "${preset.tableStyle}" 不存在`);
    }
    if (preset.codeTheme) {
      usedCodes.add(preset.codeTheme);
      if (!codeIds.has(preset.codeTheme)) err(`preset ${id}: codeTheme "${preset.codeTheme}" 不存在`);
    }
  }

  // ---- 9. orphan layout / color / table / code configs ----
  const exemptHit = new Set();
  const warnOrphan = (kind, id, label) => {
    const key = `${kind} ${id}`;
    if (INTENTIONAL_UNREFERENCED.has(key)) exemptHit.add(key);
    else warn('orphan', `${kind} ${id} 未被任何 preset 引用`);
  };
  for (const id of layoutIds) if (!usedLayouts.has(id)) warnOrphan('layout-scheme', id);
  for (const id of colorIds) if (!usedColors.has(id)) warnOrphan('color-scheme', id);
  for (const id of tableIds) if (!usedTables.has(id)) warnOrphan('table-style', id);
  for (const id of codeIds) if (!usedCodes.has(id)) warnOrphan('code-theme', id);
  for (const key of INTENTIONAL_UNREFERENCED) {
    if (!exemptHit.has(key)) warn('orphan', `exemption no longer needed: ${key} 已被引用`);
  }

  // ---- 10. font existence ----
  function extractFontFamilies(obj, found = new Set()) {
    if (!obj || typeof obj !== 'object') return found;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'fontFamily' && typeof v === 'string') found.add(v);
      else if (typeof v === 'object') extractFontFamilies(v, found);
    }
    return found;
  }

  for (const [id, preset] of presets) {
    for (const font of extractFontFamilies(preset)) {
      if (!configuredFonts.has(font)) {
        err(`preset ${id}: 使用未配置的字体 "${font}"（font-config.json 中不存在）`);
      }
    }
  }

  // ---- 11. WCAG contrast ----
  const AA_NORMAL = 4.5;
  const AA_LARGE = 3.0;

  function checkContrast(label, fgColor, bgColor, threshold, allowExceptions) {
    const fg = parseColor(fgColor);
    const bg = parseColor(bgColor);
    // unparsable colors (e.g. transparent borders) are skipped, not failed
    if (!fg || !bg) return;
    const ratio = contrastRatio(fg, bg);
    if (ratio < threshold) {
      const level = threshold === AA_NORMAL ? 'AA(4.5:1)' : `AA-large(${threshold}:1)`;
      const msg = `对比度失败: ${label} — fg=${fgColor} bg=${bgColor} ratio=${ratio.toFixed(2)} (要求 ${level})`;
      if (allowExceptions) warn('contrast-baseline', msg);
      else err(msg);
    }
  }

  for (const [id, preset] of presets) {
    const cs = colors.get(preset.colorScheme);
    if (!cs) continue;
    const pageBg = cs.background?.page || '#ffffff';
    const codeBg = cs.background?.code || pageBg;

    checkContrast(`preset ${id} text.primary`, cs.text.primary, pageBg, AA_NORMAL, false);
    checkContrast(`preset ${id} text.secondary`, cs.text.secondary, pageBg, AA_NORMAL, false);
    checkContrast(`preset ${id} text.muted`, cs.text.muted, pageBg, AA_NORMAL, false);
    checkContrast(`preset ${id} accent.link`, cs.accent.link, pageBg, AA_NORMAL, false);

    const headerBg = parseColor(cs.table.headerBackground)?.alpha === 0 ? pageBg : cs.table.headerBackground;
    checkContrast(`preset ${id} table.headerText`, cs.table.headerText, headerBg, AA_NORMAL, false);

    const codeTheme = codeThemes.get(preset.codeTheme);
    if (codeTheme) {
      const fg = codeTheme.foreground || '#24292e';
      checkContrast(`preset ${id} code.foreground`, fg, codeBg, AA_NORMAL, false);
      for (const [token, color] of Object.entries(codeTheme.colors || {})) {
        checkContrast(`preset ${id} code.${token}`, color, codeBg, AA_LARGE, true);
      }
    }

    // GitHub-canonical alert palette: dark backgrounds cannot reach AA on the
    // 10% tint, so these stay warnings (known upstream exception).
    const alertColors = {
      note: '#0969da',
      tip: '#1a7f37',
      important: '#8250df',
      warning: '#9a6700',
      caution: '#cf222e',
    };
    const pageColorParsed = parseColor(pageBg);
    for (const [kind, color] of Object.entries(alertColors)) {
      const alertFg = parseColor(color);
      let alertBgStr = pageBg;
      if (pageColorParsed && alertFg) {
        const r = Math.round(0.9 * pageColorParsed.r + 0.1 * alertFg.r);
        const g = Math.round(0.9 * pageColorParsed.g + 0.1 * alertFg.g);
        const b = Math.round(0.9 * pageColorParsed.b + 0.1 * alertFg.b);
        alertBgStr = `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
      }
      checkContrast(`preset ${id} alert.${kind}`, color, alertBgStr, AA_NORMAL, true);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      presets: presets.size,
      layouts: layoutIds.size,
      colors: colorIds.size,
      tables: tableIds.size,
      codeThemes: codeIds.size,
      fonts: configuredFonts.size,
    },
  };
}
