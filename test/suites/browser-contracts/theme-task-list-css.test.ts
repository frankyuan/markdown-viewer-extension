/**
 * Task-list checkbox CSS contract.
 *
 * remark-gfm renders `- [x]` as a `disabled` `<input type="checkbox">` inside
 * `li.task-list-item`. A disabled checkbox is painted by the UA from the
 * platform's control palette — never from the theme — so with a dark-scheme OS
 * the box becomes a near-black square whose check mark is a barely lighter gray
 * (issue #131: checked and unchecked are indistinguishable). The theme CSS
 * therefore draws the box itself out of the color scheme.
 */

import assert from 'assert';
import { describe, it } from 'node:test';
import { themeToCSS } from '../../../src/utils/theme-to-css';
import type { ThemeConfig, TableStyleConfig, CodeThemeConfig, LayoutScheme } from '../../../src/utils/theme-to-css';
import type { ColorScheme } from '../../../src/types/theme';

/** Selector the box is styled through, inside each content root. */
const BOX = 'li.task-list-item input[type="checkbox"]';
const ITEM = 'li.task-list-item';
/** Same selectors, escaped for use inside a RegExp. */
const escape = (selector: string): string => selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BOX_ESCAPED = escape(BOX);
/**
 * CSS with comments stripped and whitespace collapsed, so rule bodies can be
 * asserted as plain substrings instead of escape-heavy regular expressions.
 */
const flatCss = (css: string): string =>
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/[ \t\r\n]+/g, ' ');
// The generated rule carries the expanded dual selector list, so the selector
// portion is matched with `[^{}]*` up to the declaration block.
const BOX_RULE = `#markdown-content ${BOX_ESCAPED}[^{}]*\\{[^}]*`;
const CHECKED_RULE = `#markdown-content ${BOX_ESCAPED}:checked[^{}]*\\{[^}]*`;

function makeColorScheme(page: string, accentLink: string, textPrimary = '#000'): ColorScheme {
  return {
    id: 'test',
    name: 'Test',
    name_en: 'Test',
    description: 'Test color scheme',
    text: { primary: textPrimary, secondary: '#333', muted: '#666' },
    accent: { link: accentLink, linkHover: '#00d' },
    background: { page, code: '#f5f5f5' },
    blockquote: { border: '#ddd' },
    table: {
      border: '#ccc',
      headerBackground: '#f0f0f0',
      headerText: '#000',
      zebraEven: '#fff',
      zebraOdd: '#fafafa',
    },
  };
}

const minimalLayout: LayoutScheme = {
  id: 'test',
  name: 'Test',
  name_en: 'Test',
  description: 'Test layout',
  body: { fontSize: '12pt', lineHeight: 1.6 },
  headings: {
    h1: { fontSize: '24pt', spacingBefore: '24pt', spacingAfter: '12pt' },
    h2: { fontSize: '20pt', spacingBefore: '20pt', spacingAfter: '10pt' },
    h3: { fontSize: '16pt', spacingBefore: '16pt', spacingAfter: '8pt' },
    h4: { fontSize: '14pt', spacingBefore: '14pt', spacingAfter: '6pt' },
    h5: { fontSize: '12pt', spacingBefore: '12pt', spacingAfter: '4pt' },
    h6: { fontSize: '10pt', spacingBefore: '10pt', spacingAfter: '4pt' },
  },
  code: { fontSize: '10pt' },
  blocks: {
    paragraph: { spacingAfter: '12pt' },
    list: { spacingAfter: '12pt' },
    listItem: {},
    blockquote: { spacingAfter: '12pt', paddingVertical: '8pt', paddingHorizontal: '16pt' },
    codeBlock: { spacingAfter: '12pt', paddingVertical: '12pt', paddingHorizontal: '16pt' },
    table: { spacingAfter: '12pt' },
    horizontalRule: { spacingBefore: '12pt', spacingAfter: '12pt' },
  },
};

const minimalTableStyle: TableStyleConfig = {
  header: { fontWeight: 'bold' },
  cell: { padding: '8px 12px' },
};

const minimalCodeTheme: CodeThemeConfig = {
  colors: {},
  foreground: '#000',
};

const minimalTheme: ThemeConfig = {
  fontScheme: {
    body: { fontFamily: 'sans-serif' },
    headings: { fontFamily: 'sans-serif' },
    code: { fontFamily: 'monospace' },
  },
  layoutScheme: 'regular',
  colorScheme: 'github-light',
  tableStyle: 'classic',
  codeTheme: 'github-light',
};

function generateCSS(page = '#ffffff', accentLink = '#00f', textPrimary = '#000'): string {
  return themeToCSS(
    minimalTheme,
    minimalLayout,
    makeColorScheme(page, accentLink, textPrimary),
    minimalTableStyle,
    minimalCodeTheme,
  );
}

describe('Task-list checkbox CSS', () => {
  it('draws the box for both content roots instead of leaving it to the UA', () => {
    const css = generateCSS();
    assert.ok(css.includes(`#markdown-content ${BOX}`), 'the box rule must target the content root');
    assert.ok(
      css.includes(`.markdown-viewer-content ${BOX}`),
      'the box rule must cover the alternate content root (embed / panel hosts)',
    );
    assert.match(css, new RegExp(`${BOX_RULE}-webkit-appearance:\\s*none`), 'must drop the native control look');
    assert.match(css, new RegExp(`${BOX_RULE}appearance:\\s*none`), 'must drop the native control look');
  });

  it('hides the list marker and hangs the box in the marker gutter', () => {
    const flat = flatCss(generateCSS());
    assert.ok(
      flat.includes(`#markdown-content ${ITEM}, .markdown-viewer-content ${ITEM} { list-style: none; }`),
      'a task item shows its box instead of a bullet/number, in both content roots',
    );
    assert.ok(
      flat.includes(`#markdown-content ${BOX}, .markdown-viewer-content ${BOX} { `),
      'the box rule must cover the alternate content root (embed / panel hosts)',
    );
    // Box 0.75em wide, pulled by exactly the 1em top-level marker gutter
    // (styles.css); remark-gfm's own space is the label gap. font-size: inherit
    // is what makes both em values resolve against the BODY font, not the UA's
    // ~13px control font.
    assert.ok(
      flat.includes('font-size: inherit; width: 0.75em; height: 0.75em; margin: 0 0 0 -1em;'),
      'box metrics must fill exactly the 1em marker gutter',
    );
  });

  it('keeps the disabled box looking like a live control', () => {
    // remark-gfm emits `disabled`; UA palettes dim or grey it out.
    assert.match(generateCSS(), new RegExp(`${BOX_RULE}opacity:\\s*1`));
  });

  it('derives the unchecked box from the theme (mid-tone border, no fill)', () => {
    const css = generateCSS();
    // 28% body ink over the page colour: 0.28 × #000 over #ffffff → #b8b8b8
    assert.match(css, new RegExp(`${BOX_RULE}border:\\s*1px solid #b8b8b8`));
    assert.match(css, new RegExp(`${BOX_RULE}background-color:\\s*transparent`));
  });

  it('derives the border from the page colour so dark themes get dark borders', () => {
    const css = generateCSS('#111111', '#00f', '#eee');
    // 0.28 × #eee over #111111 → #4f4f4f
    assert.match(css, new RegExp(`${BOX_RULE}border:\\s*1px solid #4f4f4f`));
  });

  it('fills the checked box with the theme accent and a contrasting check mark', () => {
    const css = generateCSS();
    assert.match(css, new RegExp(`${CHECKED_RULE}border-color:\\s*#00f`), 'checked border must take the accent');
    assert.match(css, new RegExp(`${CHECKED_RULE}background-color:\\s*#00f`), 'checked fill must take the accent');
    assert.match(
      css,
      new RegExp(`${CHECKED_RULE}background-image:\\s*url\\("data:image/svg\\+xml,`),
      'the check mark must be an inline SVG (no font or image file)',
    );
    assert.ok(css.includes("stroke='%23ffffff'"), 'a dark accent needs the light check mark');
  });

  it('switches to dark ink when the accent is light', () => {
    const css = generateCSS('#ffffff', '#ffe066');
    assert.ok(css.includes("stroke='%231f1f1f'"), 'a light accent needs the dark check mark');
  });
});
