/**
 * Theme visual design audit (D1–D7) — quantified design principles per theme.
 * Moved here from the renderers-theme suite so every repo-wide gate lives in
 * one place; the rules live in test/gates/theme-design.js.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { auditThemes, findingsOf } from '../../gates/theme-design.js';

interface Finding { sev: string; dim: string; msg: string }
interface ThemeResult { id: string; name: string; findings: Finding[] }
interface Audit { results: ThemeResult[]; errorCount: number; warnCount: number; infoCount: number }

const audit = auditThemes() as Audit;
const lines = (items: string[]) => (items.length ? `\n${items.join('\n')}` : 'ok');

describe('theme visual design audit (D1–D7)', () => {
  it('audits the full registered preset set', () => {
    assert.ok(audit.results.length >= 30, `expected ≥30 themes, got ${audit.results.length}`);
  });

  it('every theme obeys the design principles — 0 ERROR', () => {
    const offenders = findingsOf(audit, 'ERROR');
    assert.equal(offenders.length, 0, lines(offenders));
  });

  it('no theme trips a design WARN (regression guard)', () => {
    const offenders = findingsOf(audit, 'WARN');
    assert.equal(offenders.length, 0, lines(offenders));
  });
});
