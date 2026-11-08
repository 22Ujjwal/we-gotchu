import { referencedPRs } from './references.mjs';

const itemOrder = new Intl.Collator('en', { numeric: true });

// Only explicit no-blocker answers are excluded; absence of access is a blocker.
function reportsNoBlockers(line) {
  return /^Blockers?:\s*(?:none|no blockers|none (?:found|reported|identified)(?: after checking)?)[.!]?\s*$/i.test(line);
}

// Pure transformation keeps GitHub access separate from review policy.
export function buildQueue(snapshot) {
  const items = [];
  const add = (item) => items.push({ ...item, action: 'Inspect evidence and request human review; do not act automatically.' });
  for (const [index, error] of snapshot.errors.entries()) {
    add({ id: `collection:${index}`, kind: 'collection-error', priority: 0, summary: error, evidence: { observedAt: snapshot.generatedAt } });
  }
  if (snapshot.remoteHead && snapshot.remoteHead !== snapshot.baseline) {
    add({ id: 'baseline', kind: 'baseline-drift', priority: 2, summary: "Local HEAD differs from current main. This may be this branch's own commits; compare handoff changes before treating it as stale.", evidence: { local: snapshot.baseline, remote: snapshot.remoteHead } });
  }
  for (const pr of snapshot.prs.filter(x => x.state === 'OPEN')) {
    const checks = pr.statusCheckRollup ?? [];
    const failed = checks.some(x => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(x.conclusion || x.state));
    const pending = checks.some(x => x.status ? x.status !== 'COMPLETED' : ['PENDING', 'EXPECTED'].includes(x.state));
    const checksLabel = failed ? 'failed' : pending ? 'pending' : checks.length ? 'reported checks passed or skipped' : 'unknown';
    const blocked = failed || pr.reviewDecision === 'CHANGES_REQUESTED' || pr.mergeable === 'CONFLICTING';
    add({ id: `pr:${pr.number}`, kind: 'pull-request', priority: blocked ? 1 : pr.isDraft ? 4 : 3,
      summary: `PR #${pr.number}: ${pr.title}; ${pr.isDraft ? 'draft' : 'open'}; mergeability ${(pr.mergeable || 'UNKNOWN').toLowerCase()}; checks ${checksLabel}; review ${pr.reviewDecision || 'not reported'}.`,
      evidence: pr });
  }
  for (const document of snapshot.documents) {
    document.text.split(/\r?\n/).forEach((line, index) => {
      const evidence = { path: document.path, line: index + 1, sha256: document.sha256, commit: document.commit, excerpt: line };
      const addLine = (kind, priority, summary, suffix = '') => add({ id: `${document.path}:${index + 1}:${kind}${suffix}`, kind, priority, summary, evidence });
      if (/awaiting the owner's first update/i.test(line)) addLine('missing-report', 4, 'Owner report unavailable. Activity elsewhere is unknown.');
      if (/^Blockers?:/i.test(line) && !reportsNoBlockers(line)) addLine('blocker', 1, `Reported blocker, unverified: ${line}`);
      if (/^Needs? from\b|^Decision(?: needed)?:/i.test(line)) addLine('decision', 2, `Reported request, unverified: ${line}`);
      const numbers = referencedPRs(line, snapshot.repository);
      for (const number of new Set(numbers)) {
        const pr = snapshot.prs.find(x => x.number === number);
        if (pr && pr.state !== 'OPEN') addLine('reconcile', 2, `Source references PR #${number}, now ${pr.state.toLowerCase()}. Check whether the handoff needs an owner update.`, `:${number}`);
      }
    });
  }
  items.sort((a, b) => a.priority - b.priority || itemOrder.compare(a.id, b.id));
  return { ...snapshot, complete: snapshot.errors.length === 0, items };
}

// Source prose is data, never executable markup or instructions.
function plain(value) {
  return String(value).replace(/[^\x20-\x7e]/g, ' ').replace(/[<>&\[\]`*_#\\]/g, c => `&#${c.charCodeAt(0)};`);
}
function repositoryURL(repository) {
  return `https://github.com/${repository.split('/').map(encodeURIComponent).join('/')}`;
}

function sourceLink(queue, evidence) {
  const path = evidence.path.split('/').map(encodeURIComponent).join('/');
  return `[Read source line ${evidence.line}](${repositoryURL(queue.repository)}/blob/${encodeURIComponent(evidence.commit)}/${path}#L${evidence.line})`;
}

function reportName(path) {
  const name = path.split('/').at(-1).replace(/\.md$/, '');
  return name === 'README' ? 'the team status index' : `${name[0].toUpperCase()}${name.slice(1)}'s report`;
}

function brief(value, limit = 150) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return plain(text.length > limit ? `${text.slice(0, limit - 3)}...` : text);
}

export function renderMarkdown(queue) {
  const lines = ['# Team status', '', `Updated ${plain(queue.generatedAt)}.`,
    queue.complete ? 'Snapshot complete. Checks are not approval; review comments need a separate check.'
      : 'INCOMPLETE. Do not treat missing items as resolved.', ''];
  const section = (title, entries) => {
    if (entries.length) lines.push(`## ${title}`, '', ...entries.map(x => `- ${x}`), '');
  };
  section('Needs attention', queue.items.filter(x => x.priority <= 1 && x.kind !== 'pull-request').map(x =>
    `${brief(x.kind === 'blocker' ? x.evidence.excerpt : x.summary)}${x.kind === 'blocker' ? ` [Source](${repositoryURL(queue.repository)}/blob/${encodeURIComponent(x.evidence.commit)}/${x.evidence.path.split('/').map(encodeURIComponent).join('/')}#L${x.evidence.line})` : ''}`));
  section('Decisions to confirm', queue.items.filter(x => x.kind === 'decision').map(x =>
    `${brief(x.evidence.excerpt)} ${sourceLink(queue, x.evidence)}`));
  section('Open PRs', queue.items.filter(x => x.kind === 'pull-request').map(x => {
    const pr = x.evidence;
    const checks = pr.statusCheckRollup ?? [];
    const failed = checks.some(c => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(c.conclusion || c.state));
    const pending = checks.some(c => c.status ? c.status !== 'COMPLETED' : ['PENDING', 'EXPECTED'].includes(c.state));
    const status = failed ? 'checks failed' : pending ? 'checks running' : checks.length ? 'checks passed/skipped' : 'checks unknown';
    const review = pr.reviewDecision === 'APPROVED' ? 'review approved' : pr.reviewDecision === 'CHANGES_REQUESTED' ? 'changes requested' : 'approval unconfirmed';
    const title = pr.title.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/, '');
    return `[Open PR #${pr.number}](${repositoryURL(queue.repository)}/pull/${pr.number}): ${brief(title, 90)}. ${pr.isDraft ? 'Draft; ' : ''}${status}; ${review}${pr.mergeable === 'CONFLICTING' ? '; merge conflict' : ''}.`;
  }));
  const missing = queue.items.filter(x => x.kind === 'missing-report');
  const reports = new Map();
  for (const x of queue.items.filter(x => x.kind === 'reconcile')) if (!reports.has(x.evidence.path)) reports.set(x.evidence.path, x.evidence);
  const notes = [];
  if (missing.length) notes.push(`Missing written updates: ${missing.map(x => plain(reportName(x.evidence.path))).join(', ')}. Activity elsewhere is unknown; a missing report does not mean no work was done.`);
  if (reports.size) notes.push(`Historical PR references in ${[...reports.values()].map(e => `[${plain(reportName(e.path))}](${repositoryURL(queue.repository)}/blob/${encodeURIComponent(e.commit)}/${e.path.split('/').map(encodeURIComponent).join('/')}#L${e.line})`).join(', ')} may already be accurate. Confirm only requests that still apply.`);
  section('Status notes', notes);
  lines.push('Handoff requests may be stale. [Full evidence](queue.json) stays available when needed.', '');
  return lines.join('\n');
}
