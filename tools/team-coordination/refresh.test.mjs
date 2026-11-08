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
  assert.ok(calls.every(([cmd, args]) => cmd === 'git' ? ['rev-parse', 'show'].includes(args[0]) : args[0] === 'api' || ['list', 'view'].includes(args[1])));
});

test('collection failures stay visible and never leak raw CLI errors', () => {
  const result = collect(fake({ failOpen: true, failReference: true }).execute);
  assert.equal(result.errors.length, 2);
  assert.equal(result.documents.length, 11);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
