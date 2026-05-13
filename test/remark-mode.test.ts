/**
 * Unit tests for remark-mode pure utility functions.
 *
 * Covers: truncate, formatLineRef, rangesOverlap, getBlockRange,
 *         isMediaBlock, formatExportText
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  truncate,
  formatLineRef,
  rangesOverlap,
  getBlockRange,
  isMediaBlock,
  formatExportText,
} from '../src/ui/remark-utils.ts';

// ─── truncate ────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('short ASCII: returns unchanged', () => {
    assert.strictEqual(truncate('hello', 10), 'hello');
  });

  it('long ASCII: cuts at width boundary + ellipsis', () => {
    const input = 'a'.repeat(130);
    const result = truncate(input, 120);
    assert.ok(result.endsWith('…'));
    // 119 chars + ellipsis
    assert.strictEqual(result.length, 120);
  });

  it('exact ASCII boundary: no truncation', () => {
    const input = 'a'.repeat(120);
    assert.strictEqual(truncate(input, 120), input);
  });

  it('one over ASCII boundary: truncates', () => {
    const input = 'a'.repeat(121);
    const result = truncate(input, 120);
    assert.ok(result.endsWith('…'));
    assert.strictEqual(result.length, 120);
  });

  it('pure CJK short: returns unchanged', () => {
    assert.strictEqual(truncate('你好世界', 10), '你好世界'); // width 8 < 10
  });

  it('pure CJK long: cuts respecting double width', () => {
    const input = '中'.repeat(40); // width 80
    const result = truncate(input, 50);
    assert.ok(result.endsWith('…'));
    // Each 中 = width 2, limit = 49, so 24 chars fit (48 width) + …
    assert.strictEqual(result, '中'.repeat(24) + '…');
  });

  it('mixed CJK + ASCII', () => {
    // "Hello你好World" → H(1)e(1)l(1)l(1)o(1)你(2)好(2)W(1)o(1)r(1)l(1)d(1) = 15
    const input = 'Hello你好World';
    const result = truncate(input, 12);
    // limit = 11 width. "Hello你好" = 5+4 = 9, + "W" = 10, + "o" = 11 → fits
    // + "r" = 12 → over limit
    assert.strictEqual(result, 'Hello你好Wo…');
  });

  it('empty string: returns empty', () => {
    assert.strictEqual(truncate('', 10), '');
  });

  it('very small maxWidth: only ellipsis', () => {
    const result = truncate('abcde', 1);
    assert.strictEqual(result, '…');
  });

  it('CJK fullwidth punctuation counts as 2', () => {
    // ，、。are fullwidth punctuation in CJK range
    const input = '你好，世界。';  // width: 2+2+2+2+2+2 = 12
    const result = truncate(input, 10);
    assert.ok(result.endsWith('…'));
    // limit=9, 你(2)好(2)，(2)世(2) = 8, 界(2) would be 10 > 9
    assert.strictEqual(result, '你好，世…');
  });

  it('emoji: handled without breaking surrogate pairs', () => {
    const input = '👍hello'; // 👍 is width 1 (non-CJK), h(1)e(1)l(1)l(1)o(1) = 7
    assert.strictEqual(truncate(input, 10), '👍hello');
  });
});

// ─── formatLineRef ───────────────────────────────────────────────────────────

describe('formatLineRef', () => {
  it('single line', () => {
    assert.strictEqual(formatLineRef(5, 5), 'L5');
  });

  it('line range', () => {
    assert.strictEqual(formatLineRef(5, 10), 'L5–L10');
  });

  it('line 1', () => {
    assert.strictEqual(formatLineRef(1, 1), 'L1');
  });
});

// ─── rangesOverlap ───────────────────────────────────────────────────────────

describe('rangesOverlap', () => {
  it('b fully inside a', () => {
    assert.strictEqual(rangesOverlap(5, 10, 6, 8), true);
  });

  it('left overlap', () => {
    assert.strictEqual(rangesOverlap(5, 10, 3, 7), true);
  });

  it('right overlap', () => {
    assert.strictEqual(rangesOverlap(5, 10, 8, 12), true);
  });

  it('no overlap: b after a', () => {
    assert.strictEqual(rangesOverlap(5, 10, 11, 15), false);
  });

  it('right boundary touch', () => {
    assert.strictEqual(rangesOverlap(5, 10, 10, 15), true);
  });

  it('left boundary touch', () => {
    assert.strictEqual(rangesOverlap(5, 10, 1, 5), true);
  });

  it('off by one: no overlap', () => {
    assert.strictEqual(rangesOverlap(5, 10, 1, 4), false);
  });
});

// ─── getBlockRange ───────────────────────────────────────────────────────────

function createElementStub(attrs: Record<string, string>): HTMLElement {
  return {
    getAttribute(name: string) { return attrs[name] ?? null; },
    tagName: attrs._tagName || 'DIV',
    querySelector() { return null; },
  } as unknown as HTMLElement;
}

describe('getBlockRange', () => {
  it('reads data-line and data-line-count', () => {
    const el = createElementStub({ 'data-line': '5', 'data-line-count': '3' });
    assert.deepStrictEqual(getBlockRange(el), { start: 5, end: 7 });
  });

  it('defaults line-count to 1', () => {
    const el = createElementStub({ 'data-line': '5' });
    assert.deepStrictEqual(getBlockRange(el), { start: 5, end: 5 });
  });

  it('handles line 0', () => {
    const el = createElementStub({ 'data-line': '0', 'data-line-count': '1' });
    assert.deepStrictEqual(getBlockRange(el), { start: 0, end: 0 });
  });
});

// ─── isMediaBlock ────────────────────────────────────────────────────────────

describe('isMediaBlock', () => {
  it('IMG tag → true', () => {
    const el = createElementStub({ _tagName: 'IMG' });
    assert.strictEqual(isMediaBlock(el), true);
  });

  it('div containing img → true', () => {
    const el = {
      tagName: 'DIV',
      getAttribute() { return null; },
      querySelector(sel: string) { return sel.includes('img') ? {} : null; },
    } as unknown as HTMLElement;
    assert.strictEqual(isMediaBlock(el), true);
  });

  it('plain paragraph → false', () => {
    const el = createElementStub({ _tagName: 'P' });
    assert.strictEqual(isMediaBlock(el), false);
  });

  it('div containing figure → true', () => {
    const el = {
      tagName: 'DIV',
      getAttribute() { return null; },
      querySelector(sel: string) { return sel.includes('figure') ? {} : null; },
    } as unknown as HTMLElement;
    assert.strictEqual(isMediaBlock(el), true);
  });
});

// ─── formatExportText ────────────────────────────────────────────────────────

function makeAnn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-1',
    startLine: 5,
    endLine: 5,
    selectedText: 'hello world',
    note: '',
    color: 'yellow' as const,
    timestamp: 1000,
    ...overrides,
  };
}

describe('formatExportText', () => {
  it('empty annotations → empty string', () => {
    assert.strictEqual(formatExportText([], '/test.md'), '');
  });

  it('single annotation with note', () => {
    const result = formatExportText(
      [makeAnn({ note: 'fix this' })],
      '/path/to/file.md',
    );
    assert.ok(result.includes('I reviewed **/path/to/file.md**'));
    assert.ok(result.includes('[🟡 Suggestion] L5:'));
    assert.ok(result.includes('"hello world"'));
    assert.ok(result.includes('Note: "fix this"'));
  });

  it('cross-line annotation uses range format', () => {
    const result = formatExportText(
      [makeAnn({ startLine: 5, endLine: 10 })],
      'test.md',
    );
    assert.ok(result.includes('L5–L10'));
  });

  it('multiple annotations: numbered and sorted', () => {
    const result = formatExportText([
      makeAnn({ id: 'b', startLine: 10, endLine: 10 }),
      makeAnn({ id: 'a', startLine: 5, endLine: 5 }),
    ], 'test.md');
    const lines = result.split('\n');
    // Find numbered lines
    const numbered = lines.filter(l => /^\d+\./.test(l));
    assert.strictEqual(numbered.length, 2);
    assert.ok(numbered[0].includes('L5'));
    assert.ok(numbered[1].includes('L10'));
  });

  it('same-line group: first numbered, rest indented', () => {
    const result = formatExportText([
      makeAnn({ id: 'a', startLine: 5, endLine: 8, color: 'yellow' }),
      makeAnn({ id: 'b', startLine: 5, endLine: 8, color: 'green' }),
    ], 'test.md');
    const lines = result.split('\n');
    // First annotation in group has number
    const firstAnn = lines.find(l => l.startsWith('1.'));
    assert.ok(firstAnn, 'should have numbered item');
    // Second in group is indented, no number
    const indented = lines.find(l => l.startsWith('   [🟢'));
    assert.ok(indented, 'should have indented grouped item');
  });

  it('no note: omits Note line', () => {
    const result = formatExportText([makeAnn()], 'test.md');
    assert.ok(!result.includes('Note:'));
  });

  it('unordered input: output is sorted by startLine', () => {
    const result = formatExportText([
      makeAnn({ id: 'c', startLine: 20, endLine: 20 }),
      makeAnn({ id: 'a', startLine: 1, endLine: 1 }),
      makeAnn({ id: 'b', startLine: 10, endLine: 10 }),
    ], 'test.md');
    const numbered = result.split('\n').filter(l => /^\d+\./.test(l));
    assert.ok(numbered[0].includes('L1'));
    assert.ok(numbered[1].includes('L10'));
    assert.ok(numbered[2].includes('L20'));
  });

  it('filePath appears in header', () => {
    const result = formatExportText([makeAnn()], '/Users/kyle/AGENTS.md');
    assert.ok(result.startsWith('I reviewed **/Users/kyle/AGENTS.md**'));
  });
});
