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

Current specification: [Research event options with verified evidence](../../.scratch/specs/agent-research.md).
