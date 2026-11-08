# Remaining work, stages three through five

This is the implementation and verification handoff for Tony and Ujjwal.
It supersedes earlier ownership notes that assigned all supplier inquiry work to Tony.
It is a plan, not a claim that supplier email, offer conversion, or the complete hosted journey already works.

## Current assignment

The [local integration checkpoint](local-integration-checkpoint.md) records the current implementation and evidence.
Tony now owns the remaining integration after the isolated mail transport handoff.
The later instruction limits this assignment to local testing and separate stage PRs, with no deployment.
The original ownership and hosted plan below remain historical planning context.
The external mail reply test is explicitly deferred until another team-controlled recipient is available.

## Start here

Ujjwal starts with [mail transport](ujjwal-mail.md) and the [shared interface](interfaces.md).
Tony starts with [planner and customer flow](tony-planning.md).
Both use the [verification runbook](verification.md).
After mail transport, Ujjwal can prepare [payments and hosting](payments-and-hosting.md) without waiting for the planner UI.
Copy the [handoff template](handoff-template.md) into each completed work report.

The five product stages are:

1. One planner returns a useful sourced proposal.
2. Selections survive follow-ups and return visits.
3. A selected venue becomes an approved inquiry and a supplier reply becomes an offer.
4. The selected offer becomes customer approval and sandbox payment.
5. The integrated deployment passes a recorded demo rehearsal.

Stages one and two have reported local live evidence.
Stage-two fresh-reset verification used code commit `10efa51b23bca4a303958c2be8f5f838313e981f`.
The completed follow-up retained the selected venue and compared a replacement supply price, with shipping and tax still unknown.
That evidence does not verify supplier mail, procurement, or hosted payment through the planning conversation.
Check current PR and main status before choosing an implementation base; do not infer merge status from this document.

## Work blocks, not calendar promises

No delivery dates have been agreed.
Each row is a work block that can fit a session or span several sessions.
Finish the acceptance check before marking a block complete.

| Block | Tony | Ujjwal | Integration gate |
| --- | --- | --- | --- |
| A | Implement draft generation, saved inquiry identity, editing and approval | Inspect existing mail SDK; implement isolated send adapter and inbound normalization | Same interface version and one controlled inbox available |
| B | Interpret normalized replies and render saved offers | Prove send, receipt, reply correlation and duplicate handling | One complete controlled inquiry and reply journey |
| C | Connect selected offer to existing transaction plan and approval UI | Verify existing sandbox backend against a fixed synthetic offer; implement only required adapter changes | Selected items, revision and amounts agree throughout |
| D | Run integrated local journey and fix integration failures | Prepare hosted config, migrations and webhook verification | Shipping checks pass on exact combined SHA |
| E | Rehearse and record the customer demo | Verify exact deployed revision and provider evidence | Same deployed journey passes with limitations labeled |

Within block A, neither owner needs the other's UI or provider to finish their isolated implementation.
Use a small fake transport or callback during development, clearly separated from live verification.
Do not mark the combined gate passed until both real sides work together.

## File ownership

| Owner | Owned work |
| --- | --- |
| Tony | `src/agent/planning/**`, `src/server/planning/**`, planning API routes, planning components and clients, shared inquiry types, selected-offer bridge |
| Ujjwal | New `src/server/email/supplier-inquiries/**`, new supplier-mail webhook route, existing payment and execution internals where required |
| Tony integrates | `src/server/db/schema.ts`, migrations, `src/server/db/client.ts`, root package files, generated route tree, shared contract exports and runtime composition |

Reserve `src/routes/api/supplier-mail.webhook.ts` for Ujjwal's thin inbound route if that path is free at implementation start.
Tony generates routes after integrating it.
Ujjwal passes required shared-file patches or field descriptions to Tony instead of editing the same schema or package file concurrently.
For mail persistence, use an injected repository interface until Tony adds the shared migration.
If a path already has active work, coordinate before changing ownership.
Keep the existing customer notification at `src/server/email/quote-ready.ts` separate from venue inquiries.

## Branch and integration procedure

Use a separate branch for each owner's feature.
Do not push into another owner's branch.
Record the actual base SHA in the first work report.
The published handoff branch is the initial reference for planning changes; refresh against reviewed stage-two code before implementation integration.
Ujjwal's isolated transport can begin against the current application dependencies without importing unpublished planning runtime code.

Commit verified implementation steps separately using Conventional Commits.
Only stage files owned by the current task.
Preserve `.env.local`, `.entire`, active databases, and other people's uncommitted work.
Never commit credentials, raw customer emails, provider tokens, or local database files.

Each owner hands over exact commits and evidence.
Tony integrates reviewed commits, resolves shared wiring, and runs combined checks.
A successful isolated transport test does not authorize merging unfinished customer behavior.
A failing provider call should be reported with sanitized IDs and timing, not hidden by a simulated response.

## Scope and authorization

The initial email proof uses an explicitly approved team-controlled recipient.
Real supplier outreach requires Tony's approval of the recipient and message.
The first version asks once for the exact outgoing inquiry, not for every public research action.
No automatic outreach campaign, purchase, reservation or real charge is included.
Stage four uses Stripe test mode.
Supplier execution stays labeled simulated until a real supplier adapter and evidence are verified separately.

Live activity slips, venue images, caching, model experiments and general visual polish are separate work.
Do not block these milestones on them or rewrite the current planner to accommodate them.
If venue-image work is already underway, Ujjwal should report its status before switching assignments.

## Ready-to-send assignment

Ujjwal, please own the supplier-mail transport described in `ujjwal-mail.md` first.
The send and inbound boundary in `interfaces.md` lets you implement and test independently while we build drafts, customer approval, reply interpretation and UI.
Use the existing mail integration if it supports the required operations.
Do not edit planning code, shared schema, generated routes or root package files concurrently with us.
After transport passes, prepare the existing sandbox payment path and hosted readiness from `payments-and-hosting.md` using a labeled synthetic offer.
Return exact commits, local checks, real provider evidence and unresolved limits using `handoff-template.md`.
Do not send credentials or contact a real supplier as part of this assignment.
