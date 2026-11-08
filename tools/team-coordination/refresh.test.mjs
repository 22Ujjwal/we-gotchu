import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { collect } from './refresh.mjs';

function fake({ failOpen = false, failReference = false } = {}) {
  const calls = [];
  const execute = (command, args) => {
    calls.push([command, args]);
    if (command === 'git') {
      if (args[0] === 'rev-parse') return 'abc';
      if (args[0] === 'ls-tree') return ['tony', 'leo', 'ujjwal', 'ferdinand', 'new-owner', 'README', 'template'].map(x => `docs/team/status/${x}.md`).join('\0');
      return 'Needs from Tony: inspect PR #16 and PR #16.\n';
    }
    if (args[0] === 'api') return 'main';
    if (args[1] === 'list') {
      if (failOpen) throw new Error('SECRET credential error');
      return '[]';
    }
    if (failReference) throw new Error('SECRET credential error');
    return JSON.stringify({ number: 16, state: 'MERGED', headRefOid: 'def' });
  };
  return { execute, calls };
}

test('collector uses only explicit read commands, deduplicates references, hashes exact source bytes', () => {
  const { execute, calls } = fake();
  const result = collect(execute);
  assert.equal(result.prs.length, 1);
  assert.equal(result.prs[0].state, 'MERGED');
  assert.equal(result.documents[0].sha256, createHash('sha256').update(result.documents[0].text).digest('hex'));
  assert.equal(result.documents[0].commit, 'abc');
  assert.equal(calls.filter(([cmd, args]) => cmd === 'gh' && args[1] === 'view').length, 1);
  assert.ok(calls.every(([cmd, args]) => cmd === 'git' ? ['rev-parse', 'ls-tree', 'show'].includes(args[0]) : args[0] === 'api' || ['list', 'view'].includes(args[1])));
});

test('collection failures stay visible and never leak raw CLI errors', () => {
  const result = collect(fake({ failOpen: true, failReference: true }).execute);
  assert.equal(result.errors.length, 2);
  assert.equal(result.documents.length, 12);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});


test('discovers owner reports from committed paths and excludes the template', () => {
  const result = collect(fake().execute);
  assert.ok(result.documents.some(x => x.path === 'docs/team/status/new-owner.md'));
  assert.ok(!result.documents.some(x => x.path === 'docs/team/status/template.md'));
  assert.equal(result.documents.filter(x => x.path === 'docs/team/status/README.md').length, 1);
});

test('missing status inventory is reported rather than silently omitting owners', () => {
  const { execute } = fake();
  const result = collect((cmd, args) => {
    if (args[0] === 'ls-tree') throw new Error('failure');
    return execute(cmd, args);
  });
  assert.ok(result.errors.some(x => x.includes('status inventory')));
});

test('collector ignores foreign PR URLs including their Markdown labels', () => {
  const { execute, calls } = fake();
  const result = collect((cmd, args) => args[0] === 'show'
    ? '[PR #5](https://github.com/other/library/pull/5) and https://github.com/22Ujjwal/we-gotchu/pull/16'
    : execute(cmd, args));
  assert.deepEqual(calls.filter(([cmd, args]) => cmd === 'gh' && args[1] === 'view').map(([, args]) => args[2]), ['16']);
  assert.deepEqual(result.errors, []);
});
