# Team coordination

Use this workflow with the [ownership rules](ownership.md) and [shared contracts](../contracts-draft.md).
The merged code and schemas define what is available today.
Draft documents and open PRs describe work that may still change.

## Start each session

1. Check the current branch and working tree, then fetch origin without overwriting local work.
2. Read your role brief, ownership, shared contracts, and the [team status index](status/README.md).
3. Read relevant owners' status files and open PRs that affect your files or dependencies.
4. Compare each status entry's baseline commit with current main and verify claims against the linked code or checks.
5. Declare your branch, owned files, intended result, and dependencies before editing.

A fetch updates remote references; it does not merge changes into your working branch.
Integrate required changes deliberately after checking for conflicts.
Do not read or copy another person's credentials to reproduce their work.

## Status and handoff

Each person owns one status file and updates it after a meaningful verified step, before handoff, or when a dependency changes.
Use the [template](status/template.md).
Publish the file on the implementation branch and link it from the PR so others can read updates before merge.
Before a PR URL exists, name the exact remote branch and tested commit.
At handoff, include the status-file location and PR link in the human-facing reply.
The integration owner maintains the shared index when the team supplies new branch or PR references.
Always check open PRs as well as the index because unmerged updates may not appear on main yet.

Use these availability labels:

- Proposed means the interface or behavior is still under discussion.
- On branch means code exists only at the named branch and commit.
- Merged means the implementation is available on main at the named commit.

Record runtime evidence separately as unverified, simulated, or live-verified.
Merged code is not proof that a live integration works.
Record exact checks and their tested commit; do not report a stale green result as proof for newer code.
Do not place secrets, private customer data, or raw payment details in status files.

## Shared contract changes

Ujji coordinates changes to src/contracts and shared fixtures.
A proposed change must identify the problem, affected records or endpoints, old and new behavior, affected consumers, and whether it breaks compatibility.
Tony reviews agent and supplier consumers; Leo reviews UI consumers.
Record their review or agreement in the PR before integrating a breaking change.
No coding agent should invent approval on another person's behalf.

Publish compatible additions first when possible.
For breaking changes, coordinate the contract version, consumer updates, migration order, and handling of previously stored records.
Keep dependent PRs linked and state which base commit each requires.
Do not merge a contract change while known dependent consumers are incompatible.

## Fixtures and tests

Ujji owns shared simulated fixtures and contract tests as part of the [foundation task](foundation.md).
Tony and Leo import those fixtures instead of maintaining copies with different shapes.
Tests must validate accepted examples and reject meaningful invalid input such as missing approval identity, mismatched currency, or an unsupported state.
Consumer tests should prove that the frontend and agent can use the contract outputs.
These checks are implementation requirements; this documentation PR does not add a test runner or claim the tests exist.

## Integration handoff

Each implementation PR identifies changed contracts, required setup, dependent PRs, verification evidence, and any remaining simulated behavior.
Ujji coordinates merge order for shared dependencies.
Each owner verifies their consumer after adopting a shared change.
If a status file disagrees with code, fix the status and report the discrepancy before depending on it.
