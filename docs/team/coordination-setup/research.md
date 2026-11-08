# Capability research

Inspection date: November 7, 2026, America/Los_Angeles.
This records the installed tools and repository evidence, not promises about future availability.

## Existing primitives

`orchestrator_capabilities` returned an available Codex provider with child delegation and cross-provider delegation capability.
It reported app-owned subagents, cancellation, incremental thread reads, scheduled tasks, and thread management.
The Claude provider was not authenticated; the remaining listed providers were disabled.
No additional providers were authenticated for this task.

The callable `delegate_task` contract supports a bounded child task, shared or isolated worktree execution, a target provider, and inherited or approval-required runtime modes.
Its async completion can wake the parent conversation.
The `t3_thread_read` contract supports bounded reads with source thread, run, and message provenance.
The `t3_thread_launch` contract binds a new top-level conversation to a selected worktree.
The current coordination session already had a dedicated worktree and branch, so no additional conversation or lead was launched.

The callable `watch_pull_request` contract wakes a thread on check and review changes.
That is a PR watch, not a general chief-of-staff daemon.
Capability discovery and tool contracts were inspected; no delegation, scheduling, or persistent lead behavior was exercised.
No preference-learning or shared-team approval mechanism was verified.

`workflow-kit --json inspect --repo "$PWD"` found the existing test, typecheck, and build scripts and `.github/workflows/ci.yml`.
The CI workflow installs with Bun's frozen lockfile and runs typecheck and tests.
The existing Vitest configuration covers only tests below src.

GitHub CLI 2.97.0 successfully read current PR metadata using the existing signed-in account.
Node 26.6.0 supplied the test runner, child process calls, hashing, and file output.
No additional application dependency or SaaS credential is needed for the queue.

## Repository evidence

`docs/team/coordination.md` already defines baseline checks, owner-maintained handoffs, explicit runtime labels, and human contract review.
`docs/team/ownership.md` assigns file ownership and reserves shared configuration for Ujjwal.
`docs/team/agent-workflow.md` says Tony's six research tickets retain their existing scope.
The status index still referenced PR #6 as open, while the live GitHub read returned CLOSED.
Ujjwal's handoff requested review of PRs #15 and #16, while the live read returned MERGED for both.
Leo and Ferdinand had placeholder reports, which do not establish whether they are working elsewhere.
No owner status files were changed to repair these discrepancies.

## Choice

Use GitHub CLI reads plus committed Markdown as inputs, and local Markdown and JSON as outputs.
This works with existing credentials and gives each item reproducible source evidence without a new service.
The cost is manual refresh and limited extraction of unstructured prose.
A web dashboard or scheduler would add processes, state, permissions, and tests without improving the first version's evidence.
Tony's replacement instructions prohibit child agents.
Bounded lead assessments run in the current conversation unless Tony explicitly requests separate independent sessions.
The discovered delegation capability is recorded here as research, not an instruction to use it.
The existing coordination rules remain in force.
