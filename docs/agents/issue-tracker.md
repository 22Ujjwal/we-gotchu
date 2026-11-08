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

## Event interface integration

Tony owns integration of the existing frontend and customer API while preserving Leo's design.
The specification uses the existing ready-for-agent triage label; the implementation ticket is unclaimed until work starts.

- [Connect the event interface to the working backend](../../.scratch/specs/event-ui-integration.md).
- [01: Connect and verify the existing event journey](../../.scratch/event-integration/issues/01-connect-event-journey.md).

## Single-planner live milestone

Tony approved two local tickets for a useful single-planner proposal and a persistent follow-up journey.
These tickets replace mandatory Monid and specialist-delegation assumptions for this milestone without modifying or closing the earlier planning ticket.
Use real-run-first verification with no new automated tests by default; consider focused regression coverage if a live failure exposes a bug.
Existing shipping checks still apply, and the local-only hold remains in effect.
Work ticket 01 first; ticket 02 starts after its blocker passes.

- [01: Deliver a useful proposal with one planner](../../.scratch/single-planner/issues/01-deliver-useful-proposal.md).
- [02: Keep customer choices through changes and return visits](../../.scratch/single-planner/issues/02-preserve-choices-and-return.md).

## Stage three: selected venue inquiries

Tony approved three local tickets to move from a saved venue selection to an inquiry and a supplier reply on the same conversation.
This stage extends the earlier planning milestone, which deferred supplier contact; it does not authorize live outreach or purchases by itself.
Prepare the email integration prerequisites while stage two is reviewed, then implement the tickets in dependency order.
Use the existing email integration if it supports sending, reply correlation, and inbound processing; coordinate that decision with Ujjwal before adding another provider.
Venue images remain independent work.

- [01: Prepare an inquiry for the selected venue](../../.scratch/venue-inquiries/issues/01-prepare-selected-venue-inquiry.md).
- [02: Send and track the approved inquiry](../../.scratch/venue-inquiries/issues/02-send-and-track-approved-inquiry.md).
- [03: Turn a supplier reply into an updated offer](../../.scratch/venue-inquiries/issues/03-turn-supplier-reply-into-offer.md).
