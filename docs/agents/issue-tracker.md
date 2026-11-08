# Local decision tracker

The current Wayfinder map is .scratch/event-demo/map.md.
Each child decision is one Markdown file under .scratch/event-demo/issues.
Use Type and Label to distinguish research from human decisions.
Status is open, claimed, or resolved; Assignee records the claim.
Blocked by lists sibling ticket filenames; a ticket is ready only when every blocker is resolved.
Before work, claim a ticket by recording its assignee and claimed status.
Resolve by adding an Answer section, marking resolved, and adding a named link and short gist to the map.
Human decisions may not be resolved by treating an assistant proposal as approval.

## Feature specifications

Feature specifications live under .scratch/specs as one Markdown file per spec.
Use Type: spec, Status: open, Label: ready-for-agent, and Owner to identify a published specification.
This triage label comes from the to-spec workflow and is separate from Wayfinder decision labels.
Publishing a spec does not create implementation tickets or close human decision tickets.
A pushed branch publishes the local tracker artifact for team review; main changes only after its PR is merged.

Published specifications:

- Tony: [Research event options with verified evidence](../../.scratch/specs/agent-research.md).
- Ujjwal: [Approve, pay, and cancel an event safely](../../.scratch/specs/transactions.md).

## Implementation tickets

Approved research implementation tickets live under .scratch/agent-research/issues, one file per slice.
Each ticket records What to build, Blocked by, Status, and observable acceptance criteria.
Status: ready-for-agent is the initial triage state, not a claim that external prerequisites are satisfied.
Start only when the named implementation blockers and external prerequisites are complete.
Tony owns these research tickets; Ujjwal coordinates shared contracts and storage, and Leo owns frontend rendering.
The approved research specification remains unchanged.

- [01: Research a complete brief using real sources](../../.scratch/agent-research/issues/01-research-complete-brief.md).
- [02: Investigate supplier details beyond search listings](../../.scratch/agent-research/issues/02-investigate-supplier-details.md).
- [03: Recommend options with defensible quantities and costs](../../.scratch/agent-research/issues/03-recommend-options.md).
- [04: Update research when the customer changes their brief](../../.scratch/agent-research/issues/04-revise-event-brief.md).
- [05: Expose research progress and cancellation through the application contract](../../.scratch/agent-research/issues/05-progress-and-cancellation.md).
- [06: Recover interrupted research without duplicating work](../../.scratch/agent-research/issues/06-recover-interrupted-research.md).
