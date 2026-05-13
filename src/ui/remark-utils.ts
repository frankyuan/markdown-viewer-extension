/**
 * Pure utility functions for Remark Mode.
 *
 * These functions have no DOM, chrome.*, or side-effect dependencies
 * so they can be imported directly in unit tests.
 */

// ─── Types (re-exported for test convenience) ────────────────────────────────

export type RemarkColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface RemarkAnnotation {
  id: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  note: string;
  color: RemarkColor;
  timestamp: number;
  blockId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const COLOR_MAP: Record<RemarkColor, { emoji: string; bg: string; border: string }> = {
  yellow: { emoji: '🟡', bg: 'rgba(250, 204, 21, 0.2)', border: 'rgba(250, 204, 21, 0.6)' },
  green:  { emoji: '🟢', bg: 'rgba(74, 222, 128, 0.2)', border: 'rgba(74, 222, 128, 0.6)' },
  blue:   { emoji: '🔵', bg: 'rgba(96, 165, 250, 0.2)', border: 'rgba(96, 165, 250, 0.6)' },
  pink:   { emoji: '🩷', bg: 'rgba(244, 114, 182, 0.2)', border: 'rgba(244, 114, 182, 0.6)' },
};

export const COLOR_LABELS: Record<RemarkColor, string> = {
  yellow: 'Suggestion',
  green: 'Keep',
  blue: 'Question',
  pink: 'Concern',
};

// Tags that should not be annotatable (images, charts, media)
export const SKIP_ANNOTATION_TAGS = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME']);

// ─── Pure functions ──────────────────────────────────────────────────────────

/**
 * Width-aware text truncation. CJK characters and fullwidth punctuation count
 * as 2 units of width; everything else counts as 1. When the text exceeds
 * `maxWidth`, it is cut and an ellipsis `…` (width 1) is appended.
 */
export function truncate(str: string, maxWidth: number): string {
  if (!str) return str;
  // First pass: measure total width
  let totalWidth = 0;
  for (const ch of str) {
    totalWidth += /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 2 : 1;
  }
  if (totalWidth <= maxWidth) return str; // fits, no truncation needed

  // Needs truncation: cut to (maxWidth - 1) and append ellipsis
  const limit = maxWidth - 1;
  let width = 0;
  let cutIndex = 0;
  for (const ch of str) {
    const w = /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF\u3000-\u303F]/.test(ch) ? 2 : 1;
    if (width + w > limit) {
      return str.slice(0, cutIndex) + '…';
    }
    width += w;
    cutIndex += ch.length;
  }
  return str.slice(0, cutIndex) + '…';
}

/** Format a line reference: `L5` for single line, `L5–L10` for a range. */
export function formatLineRef(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}–L${endLine}`;
}

/** Read the line range of a rendered markdown block element. */
export function getBlockRange(el: HTMLElement): { start: number; end: number } {
  const start = Number(el.getAttribute('data-line')) || 0;
  const count = Number(el.getAttribute('data-line-count')) || 1;
  return { start, end: start + count - 1 };
}

/** Check whether two inclusive integer ranges [aS, aE] and [bS, bE] overlap. */
export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

/** Check if a block element is a media/image block that should not be annotatable. */
export function isMediaBlock(el: HTMLElement): boolean {
  if (SKIP_ANNOTATION_TAGS.has(el.tagName)) return true;
  return !!(el.querySelector('img, svg, canvas, video, figure, picture'));
}

/**
 * Pure-function version of export formatting.
 * Takes annotations + filePath, returns structured prompt text.
 */
export function formatExportText(
  annotations: readonly RemarkAnnotation[],
  filePath: string,
): string {
  if (annotations.length === 0) return '';

  const sorted = [...annotations].sort((a, b) => a.startLine - b.startLine);

  const groups: { key: string; lineRef: string; anns: RemarkAnnotation[] }[] = [];
  for (const ann of sorted) {
    const key = `${ann.startLine}-${ann.endLine}`;
    const lineRef = formatLineRef(ann.startLine, ann.endLine);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.anns.push(ann);
    } else {
      groups.push({ key, lineRef, anns: [ann] });
    }
  }

  const lines: string[] = [];
  lines.push(`I reviewed **${filePath}** and have the following feedback:\n`);

  for (let i = 0; i < groups.length; i++) {
    const { lineRef, anns } = groups[i];
    for (let j = 0; j < anns.length; j++) {
      const ann = anns[j];
      const label = COLOR_LABELS[ann.color];
      const quote = truncate(ann.selectedText, 120);

      if (j === 0) {
        let line = `${i + 1}. [${COLOR_MAP[ann.color].emoji} ${label}] ${lineRef}: "${quote}"`;
        if (ann.note) line += `\n   Note: "${ann.note}"`;
        lines.push(line);
      } else {
        let line = `   [${COLOR_MAP[ann.color].emoji} ${label}] "${quote}"`;
        if (ann.note) line += `\n   Note: "${ann.note}"`;
        lines.push(line);
      }
    }
  }

  return lines.join('\n');
}
