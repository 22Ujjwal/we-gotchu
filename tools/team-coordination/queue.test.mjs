import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, renderMarkdown } from './queue.mjs';

const pr = (overrides = {}) => ({ number: 16, title: 'Contracts', state: 'OPEN', url: 'https://github.com/22Ujjwal/we-gotchu/pull/16', headRefOid: 'abc', reviewDecision: '', mergeable: 'MERGEABLE', statusCheckRollup: [], ...overrides });
const doc = (text) => ({ path: 'docs/team/status/ujjwal.md', text, sha256: 'digest', commit: 'baseline' });
const snapshot = (overrides = {}) => ({ generatedAt: '2026-11-08T03:00:00Z', repository: '22Ujjwal/we-gotchu', baseline: 'baseline', remoteHead: 'baseline', documents: [], prs: [], errors: [], ...overrides });

test('failed checks and changes requested precede review and preserve exact head evidence', () => {
  const result = buildQueue(snapshot({ prs: [pr(), pr({ number: 17, reviewDecision: 'CHANGES_REQUESTED', headRefOid: 'def' }), pr({ number: 18, statusCheckRollup: [{ conclusion: 'FAILURE', name: 'ci' }] })] }));
  assert.deepEqual(result.items.map(x => x.priority), [1, 1, 3]);
  assert.equal(result.items.find(x => x.id === 'pr:17').evidence.headRefOid, 'def');
  assert.ok(result.items.every(x => x.action.includes('human')));
});

test('merged referenced PR remains evidence, never an open review task', () => {
  const result = buildQueue(snapshot({ documents: [doc('Next step: review PR #16.\nBlockers: none found after checking.')], prs: [pr({ state: 'MERGED' })] }));
  assert.equal(result.items.filter(x => x.id === 'pr:16').length, 0);
  assert.ok(result.items.some(x => x.kind === 'reconcile' && x.evidence.line === 1));
  assert.equal(result.items.filter(x => x.kind === 'blocker').length, 0);
});

test('handoff requests retain path, line and digest, and missing reports do not imply idle owners', () => {
  const result = buildQueue(snapshot({ documents: [doc("Needs from Tony: review Candidate fields.\nBlockers: waiting for endpoint.\nStatus: awaiting the owner's first update.")] }));
  assert.ok(result.items.some(x => x.kind === 'decision' && x.evidence.line === 1 && x.evidence.sha256 === 'digest'));
  assert.ok(result.items.some(x => x.kind === 'blocker' && x.priority === 1));
  assert.ok(result.items.some(x => x.kind === 'missing-report'));
});

test('unknown checks and draft PRs never become approval or readiness claims', () => {
  const result = buildQueue(snapshot({ prs: [pr({ isDraft: true, mergeable: 'UNKNOWN' })] }));
  assert.match(result.items[0].summary, /draft.*unknown/i);
  assert.match(result.items[0].summary, /checks unknown/i);
  assert.equal(result.items[0].priority, 4);
});

test('partial collection and baseline drift are prominent and deterministic', () => {
  const input = snapshot({ errors: ['GitHub open PR collection failed.'], remoteHead: 'new' });
  const result = buildQueue(input);
  assert.equal(result.complete, false);
  assert.equal(result.items[0].priority, 0);
  assert.ok(result.items.some(x => x.kind === 'baseline-drift'));
  assert.deepEqual(result, buildQueue(input));
});

test('Markdown renders untrusted source text as inert ASCII and retains provenance', () => {
  const result = buildQueue(snapshot({ prs: [pr({ title: '<script>alert(1)</script> [click](https://bad.example)\n# forged \u202e' })] }));
  const md = renderMarkdown(result);
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('[click]'));
  assert.ok(!/[^\x00-\x7f]/.test(md));
  assert.match(md, /abc/);
});

test('multiple resolved PR references on one line produce unique queue IDs', () => {
  const result = buildQueue(snapshot({ documents: [doc('Review PR #16 and PR #17.')], prs: [pr({ state: 'MERGED' }), pr({ number: 17, state: 'CLOSED' })] }));
  assert.equal(new Set(result.items.map(x => x.id)).size, result.items.length);
});
