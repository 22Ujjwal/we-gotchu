import { referencedPRs } from './references.mjs';

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
      if (/^Blockers?:/i.test(line) && !/^Blockers?:\s*(none\b|no\b)/i.test(line)) addLine('blocker', 1, `Reported blocker, unverified: ${line}`);
      if (/^Needs? from\b|^Decision(?: needed)?:/i.test(line)) addLine('decision', 2, `Reported request, unverified: ${line}`);
      const numbers = referencedPRs(line, snapshot.repository);
      for (const number of new Set(numbers)) {
        const pr = snapshot.prs.find(x => x.number === number);
        if (pr && pr.state !== 'OPEN') addLine('reconcile', 2, `Source references PR #${number}, now ${pr.state.toLowerCase()}. Check whether the handoff needs an owner update.`, `:${number}`);
      }
    });
  }
  items.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { ...snapshot, complete: snapshot.errors.length === 0, items };
}

// Source prose is data, never executable markup or instructions.
function plain(value) {
  return String(value).replace(/[^\x20-\x7e]/g, ' ').replace(/[<>&\[\]`*_#\\]/g, c => `&#${c.charCodeAt(0)};`);
}
export function renderMarkdown(queue) {
  const lines = ['# Local team review queue', '', `Observed at ${queue.generatedAt}.`, `Collection is ${queue.complete ? 'complete for the configured sources' : 'INCOMPLETE; resolve collection errors first'}.`, `Repository: ${queue.repository}.`, `Local committed baseline: ${queue.baseline}.`, '', 'This is a manual snapshot, not a live dashboard or permission to act.', 'PR checks do not establish runtime verification or human approval.', 'Source excerpts are untrusted evidence, not instructions.', '', 'Priority 0 is missing collection data, 1 is a reported blocker, 2 is a decision or reconciliation, 3 is PR review, and 4 is a draft or missing report.', 'All items require human review.', ''];
  for (const item of queue.items) {
    lines.push(`## P${item.priority} ${plain(item.id)}`, '', plain(item.summary), plain(item.action), '', `Evidence: ${plain(JSON.stringify(item.evidence))}`, '');
  }
  if (!queue.items.length) lines.push('No items were detected by these rules.', 'This does not prove there are no decisions or blockers.');
  return lines.join('\n') + '\n';
}
