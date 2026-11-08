import { referencedPRs } from './references.mjs';

const priorityKey = [
  'Priority 0 means missing collection data.',
  'Priority 1 means failed checks, requested changes, merge conflicts, or an explicitly reported blocker.',
  'Priority 2 means an explicit decision request, a closed or merged PR reference to reconcile, or a baseline difference.',
  'Priority 3 means an open PR needs human inspection.',
  'Priority 4 means a draft PR or a missing owner report.',
];
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

export function renderMarkdown(queue) {
  const lines = ['# Team review briefing', '', `Updated ${plain(queue.generatedAt)}.`,
    queue.complete ? 'Collection completed for the configured sources.' : 'INCOMPLETE: some sources could not be read. Do not treat missing items as resolved.',
    'This is a manual snapshot. Refresh before acting; passing checks do not establish approval or live runtime behavior.', ''];
  const section = (title, items, empty, render) => {
    lines.push(`## ${title}`, '');
    if (!items.length) lines.push(empty, '');
    else for (const item of items) render(item);
  };
  const renderPR = item => {
    const pr = item.evidence;
    const checks = pr.statusCheckRollup ?? [];
    const failed = checks.filter(x => ['FAILURE', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'ERROR'].includes(x.conclusion || x.state));
    const pending = checks.some(x => x.status ? x.status !== 'COMPLETED' : ['PENDING', 'EXPECTED'].includes(x.state));
    const checkText = failed.length ? `Checks need attention: ${failed.map(x => plain(x.name || x.context || 'unnamed check')).join(', ')}.`
      : pending ? 'Checks are still running.' : checks.length ? 'Reported checks passed or were skipped.' : 'No checks were reported.';
    const reviewText = pr.reviewDecision === 'APPROVED' ? 'GitHub reports an approved review.'
      : pr.reviewDecision === 'CHANGES_REQUESTED' ? 'A reviewer requested changes.' : 'No approval decision is reported.';
    const mergeText = pr.mergeable === 'CONFLICTING' ? 'This branch has merge conflicts.'
      : pr.mergeable === 'MERGEABLE' ? '' : 'Mergeability is not yet known.';
    lines.push(`### ${pr.isDraft ? 'Draft: ' : ''}${plain(pr.title)}`, '',
      `${checkText} ${reviewText} ${mergeText}`.trim(),
      item.priority === 1 ? 'Next step: inspect the failed checks or requested changes before considering this PR for merge.'
        : pr.isDraft ? 'Next step: confirm the remaining work with its owner before requesting review.'
        : 'Next step: review the diff, discussions, and dependencies; confirm the responsible owner agrees before merging.',
      `[Open PR #${pr.number}](${repositoryURL(queue.repository)}/pull/${pr.number}) | Head: ${plain(pr.headRefOid)}.`, '');
  };
  section('Needs attention', queue.items.filter(x => x.priority <= 1), 'No blockers were detected in the collected sources. This does not prove the team is unblocked.', item => {
    if (item.kind === 'pull-request') return renderPR(item);
    lines.push(`### ${item.kind === 'collection-error' ? 'Refresh could not read a source' : `Reported blocker in ${plain(reportName(item.evidence.path))}`}`, '', plain(item.kind === 'blocker' ? item.evidence.excerpt : item.summary),
      item.kind === 'blocker' ? 'Next step: confirm whether this still blocks progress with the report owner.' : 'Next step: resolve the collection error and refresh before relying on coverage.',
      item.kind === 'blocker' ? sourceLink(queue, item.evidence) : '', '');
  });
  section('Decisions to confirm', queue.items.filter(x => x.kind === 'decision'), 'No explicit decision requests were found.', item => {
    lines.push(`### Request in ${plain(reportName(item.evidence.path))}`, '', plain(item.evidence.excerpt),
      'Why it matters: the handoff names a dependency on someone else. Confirm that the request is still current before acting.', sourceLink(queue, item.evidence), '');
  });
  section('Pull requests to review', queue.items.filter(x => x.kind === 'pull-request' && x.priority > 1), 'No other open PRs were collected.', renderPR);

  const reports = new Map();
  for (const item of queue.items.filter(x => x.kind === 'reconcile' || x.kind === 'missing-report')) {
    const path = item.evidence.path;
    if (!reports.has(path)) reports.set(path, []);
    reports.get(path).push(item);
  }
  section('Handoff follow-ups', [...reports.entries()], 'No handoff follow-ups were detected.', ([path, items]) => {
    const missing = items.some(x => x.kind === 'missing-report');
    lines.push(`### ${missing ? 'Request an update from' : 'Check references in'} ${plain(reportName(path))}`, '');
    if (missing) lines.push('The committed report is still a placeholder. Activity elsewhere is unknown.', 'Next step: ask the owner for a current handoff when you need their status.');
    else {
      const numbers = [...new Set(items.flatMap(x => referencedPRs(x.evidence.excerpt, queue.repository)))];
      const resolved = numbers.map(number => queue.prs.find(pr => pr.number === number)).filter(pr => pr && pr.state !== 'OPEN');
      lines.push(`This report mentions ${resolved.map(pr => `PR #${pr.number} (${pr.state.toLowerCase()})`).join(', ')}.`,
        'These historical references may already be accurate. They are not fresh approval requests.',
        'Next step: check whether any next-step wording still depends on a resolved PR; let the report owner update it.');
    }
    lines.push([...new Map(items.map(x => [x.evidence.line, sourceLink(queue, x.evidence)])).values()].join(' | '), '');
  });
  lines.push('## Evidence and limits', '',
    'Full source excerpts, hashes, check records, and individual queue items remain in [queue.json](queue.json).',
    `This briefing reads committed handoffs at ${plain(queue.baseline)}. Uncommitted work and other branches are not included.`);
  if (queue.remoteHead !== queue.baseline) lines.push("This checkout differs from main. That may be this branch's own work; compare relevant handoff changes before calling a report stale.");
  lines.push('Source text is evidence, not instructions. No messages, assignments, approvals, or merges happen when this queue refreshes.', '', ...priorityKey, '');
  return lines.join('\n') + '\n';
}
