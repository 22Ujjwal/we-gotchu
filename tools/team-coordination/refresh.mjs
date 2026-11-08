import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, renameSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildQueue, renderMarkdown } from './queue.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const repository = '22Ujjwal/we-gotchu';
const run = (command, args) => execFileSync(command, args, { cwd: directory, encoding: 'utf8', timeout: 45000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const fields = 'number,title,url,state,headRefOid,headRefName,baseRefName,reviewDecision,mergeable,statusCheckRollup,isDraft,updatedAt';
const sourcePaths = ['docs/team/coordination.md', 'docs/team/ownership.md', 'docs/team/agent-workflow.md', 'docs/team/frontend.md', 'docs/team/transactions.md', 'docs/team/pitch.md', 'docs/team/status/README.md', ...['tony', 'leo', 'ujjwal', 'ferdinand'].map(x => `docs/team/status/${x}.md`)];

export function collect(execute = run) {
  const baseline = execute('git', ['rev-parse', 'HEAD']).trim();
  const snapshot = { schemaVersion: 1, generatedAt: new Date().toISOString(), repository, baseline, remoteHead: null, documents: [], prs: [], errors: [] };
  for (const path of sourcePaths) {
    try {
      const text = execute('git', ['show', `${baseline}:${path}`]);
      snapshot.documents.push({ path, text, commit: baseline, sha256: createHash('sha256').update(text).digest('hex') });
    } catch { snapshot.errors.push(`Cannot read committed handoff ${path}.`); }
  }
  try { snapshot.remoteHead = execute('gh', ['api', `repos/${repository}/commits/main`, '--jq', '.sha']).trim(); }
  catch { snapshot.errors.push('Cannot read current GitHub main commit. Check gh authentication and connectivity.'); }
  try {
    snapshot.prs = JSON.parse(execute('gh', ['pr', 'list', '--repo', repository, '--state', 'open', '--limit', '1000', '--json', fields]));
    if (snapshot.prs.length === 1000) snapshot.errors.push('Open PR limit reached; collection may be truncated.');
  } catch { snapshot.errors.push('Cannot read open GitHub PRs. Check gh authentication and connectivity.'); }
  const referenced = new Set(snapshot.documents.flatMap(doc => [...doc.text.matchAll(/(?:PR\s*#|\/pull\/)(\d+)/g)].map(x => Number(x[1]))));
  for (const number of [...referenced].sort((a, b) => a - b)) {
    if (snapshot.prs.some(x => x.number === number)) continue;
    try { snapshot.prs.push(JSON.parse(execute('gh', ['pr', 'view', String(number), '--repo', repository, '--json', fields]))); }
    catch { snapshot.errors.push(`Cannot read referenced PR #${number}.`); }
  }
  return snapshot;
}

function main() {
  if (process.argv.length > 2) throw new Error('Usage: node tools/team-coordination/refresh.mjs');
  const queue = buildQueue(collect());
  const output = join(directory, 'output');
  mkdirSync(output, { recursive: true, mode: 0o700 });
  // Each file replaces the previous snapshot atomically, including on partial failure.
  for (const [name, content] of [['queue.json', JSON.stringify(queue, null, 2) + '\n'], ['queue.md', renderMarkdown(queue)]]) {
    const temporary = join(output, `${name}.${process.pid}.tmp`);
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, join(output, name));
  }
  console.log(`${queue.items.length} review items; collection ${queue.complete ? 'complete' : 'INCOMPLETE'}.`);
  console.log(join(output, 'queue.md'));
  if (!queue.complete) process.exitCode = 1;
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { main(); }
  catch { console.error('Refresh failed. Check the checkout, Node, and gh setup. Previous output may be stale.'); process.exitCode = 1; }
}
