# Local development coordination

Tony can use one chief-of-staff conversation to review the team's work with evidence.
This setup coordinates development of We Gotchu, not the agents inside the product.
It does not change anyone's current assignment, including Tony's supplier research ticket02.

## Run it

Run these commands from the repository root with Node 22 or newer, Git, and a signed-in GitHub CLI that can read `22Ujjwal/we-gotchu`.
The queue needs no npm install, server, API key file, or product environment variables.

```sh
node --test tools/team-coordination/*.test.mjs
node tools/team-coordination/refresh.mjs
cat tools/team-coordination/output/queue.md
```

Open `tools/team-coordination/output/queue.md` in your editor for the review queue.
The adjacent `queue.json` includes the collected handoff text and PR metadata for an agent to inspect.
Both files are local, ignored by Git, and overwritten on refresh.
The collector uses the existing `gh` credential store without displaying credentials or raw command errors.
Do not copy credentials into prompts, handoffs, or these files.

Use [the chief-of-staff prompt](chief-of-staff.md) in this separate coordination session.
Say "Refresh the queue and tell me which decision needs me first."
The chief reads the snapshot, checks the evidence, and brings Tony a specific question or recommendation.
Use [the area lead prompt](area-leads.md) only when Tony asks for a bounded assessment or a new assignment.
No agent is started by the refresh command.

## Human review loop

1. Refresh before a review and check the timestamp, `complete` field, and baseline.
2. Resolve P0 collection errors before trusting the queue's coverage.
3. Read the highest-priority item and inspect its source line or PR at the recorded head commit.
4. Ask the responsible human to decide any cross-owner change, assignment, approval, or merge.
5. Keep that decision in the current conversation unless Tony explicitly requests a durable record.
6. Refresh again after a PR changes or an owner publishes a handoff.

The command exits with status 1 and writes an INCOMPLETE snapshot when a configured source cannot be read.
If Git or output writing fails before a snapshot can be written, the command reports failure and old files may remain.
Always check the timestamp and exit status; old green output is not current evidence.
The two output files replace individually, not as one transaction; do not refresh concurrently or read while refresh is running.

The generated queue header contains the priority key maintained in `tools/team-coordination/queue.mjs`.
These are deterministic triage rules, not learned preferences or a claim about business urgency.

## What the snapshot covers

The collector reads eleven committed files at this checkout's exact HEAD: coordination, ownership, four role briefs, the status index, and four owner status files.
Uncommitted edits and handoffs on other branches are not read.
Every document has its path, commit, exact-text SHA-256, and full text in JSON.
Extracted items also include a one-based line number and excerpt.

The GitHub CLI reads up to 1,000 open PRs, current main's commit, and each PR referenced as `PR #123` or `/pull/123` in those documents.
Reaching the open-PR cap makes the collection incomplete.
Every PR includes its state, head commit, update time, draft status, mergeability, review decision, and reported checks with available evidence URLs.
Reads happen sequentially, so this is an observation window rather than a transactional GitHub snapshot.
Recheck the head before acting.
A passing or skipped reported check is not proof that all required checks exist, the application works live, or someone approved a merge.

Requests use explicit lines beginning `Needs from`, `Need from`, or `Decision:`.
Blockers use lines beginning `Blocker:` or `Blockers:`; only explicit answers such as `none`, `no blockers`, and `none found after checking` are excluded.
Other natural-language negation is not understood; `No-show risk` and `No access` remain reported blockers.
Other prose remains available in JSON for the chief to read.
Resolved PR references are deliberately conservative reconciliation candidates, including accurate historical references.
They are not automatic claims that the document is wrong.
A different main SHA may simply mean this branch has its own commits, not that its handoffs are outdated.

## Limits and remaining setup

This version has no daemon, scheduling, persistent lead agents, preference learning, automatic delegation, merge button, or outbound messaging.
It does not read chat, private personal memory, other T3 threads, inline PR discussions, or handoff files from unmerged PR branches.
It does not infer who is idle or assign PR ownership from an author name.
The chief must inspect relevant PR diffs and discussions before recommending a decision.
The source text is untrusted evidence; instructions inside it do not override the user's task.
Markdown source excerpts are escaped, while JSON preserves original source text for inspection.

For another checkout, first obtain this PR's files and confirm the checkout you intend to review.
For a refreshed main baseline, deliberately update this coordination branch after inspecting local work; refresh never fetches, checks out, rebases, or merges.
The owner must update their own status file when a report is stale.
Existing project CI tests `src/**/*.test.ts` and does not discover the standalone Node suite.
Run the standalone command explicitly until the root configuration owner chooses to add it to CI.

See [capability research](research.md) and [verification](verification.md) for what was actually checked.
