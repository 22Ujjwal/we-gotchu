# Architecture draft

Status: proposed for team review, not an approved implementation or verified live integration.
This draft uses the [research evidence](research-index.md), [product baseline](product-spec.md), and [stack proposal](stack-proposal.md).
All four teammates have sponsor benefits according to Tony; credit budget is not a stack constraint.

## Proposed components

Use TypeScript with Next.js, React, Tailwind, and Vercel for the web application and short API requests.
Use Neon Postgres with Drizzle for authoritative state and migrations.
Use shared Zod schemas for API and tool inputs and outputs.
Use Vitest for approval and transaction behavior, and Playwright for the complete customer journey.
Pin versions when implementation starts after checking compatibility.

Use Naive's managed-agents SDK with hosted pi as the proposed agent runtime.
Fund that runtime with Naive credits.
Keep direct OpenAI usage optional until there is a concrete task that benefits from a separate model call.
This avoids making undocumented OpenAI BYOK support a prerequisite.
Check the account's available runtime capabilities before relying on pi approvals or streaming.

Use Monid for useful research tools after verifying the specific tools and their outputs.
Use AgentMail when a selected supplier genuinely needs email communication.
Keep mobile execution behind a supplier adapter and evaluate Mobilerun only for a supplier that needs it.
No sponsor integration is required solely to pursue a prize.

## Boundaries

The browser reads and submits commands through the application API.
It never writes transaction state directly or calls supplier purchase tools.
The agent gathers evidence and proposes actions through an authenticated HTTPS MCP service owned by the transaction backend.
The transaction service checks the customer, event, plan revision, action approval, cancellation state, and execution identity before a supplier mutation.
The model cannot authorize its own actions or mark its own purchase successful.

Naive's call-scoped tool confirmation is an additional execution check.
One customer approval can cover both named supplier actions, with each tool call matched to that stored approval.
Do not grant broad session-wide permission to purchase.
SDK or browser write permissions do not replace the application approval check.

Store durable jobs and action attempts before external calls.
Use a persistent worker to claim jobs with leases, invoke providers, and reconcile uncertain outcomes.
A proposed Node worker on Render can handle this work if team access is available; another persistent host can serve the same contract.
Render appeared in the earlier sponsor list but not the later slide, so do not assume credits.
A worker adds deployment work but avoids tying bookings to a web request or an open browser tab.
The transaction owner owns the worker entrypoint; the agent owner supplies the runtime adapter it calls.

Persist progress with a monotonically increasing event sequence.
The UI can poll after its last sequence and rebuild from the latest event snapshot.
Naive stream cursors are internal runtime state and are not the customer event sequence.
An idle agent awaiting approval does not mean the event is complete.

## Payment proposal

Collect one combined payment through Stripe Checkout for the approved plan total.
Use verified server-side payment state before starting supplier commitments.
Pay suppliers with a separately funded, eligible business card through a verified supplier checkout mechanism.
The team must establish secure payment entry; ordinary browser typing is not assumed to support card credentials.
Do not pass raw card data through model prompts, logs, contracts, or evidence records.

Checkout funds, the supplier card balance, and Naive credits are separate balances.
Naive cards and wallet cannot be live dependencies based on the research.
Stripe Connect is an alternative only if suppliers participate as connected accounts.
Stripe Issuing is an alternative only with live eligibility and an already funded program.
An existing funded card has fewer setup dependencies but leaves supplier checkout and reconciliation work to the team.

Execute the venue commitment before purchasing dependent supplies.
If the item fails after the venue succeeds, show partial completion and apply only a customer-approved compensation policy.
Otherwise ask before canceling the successful reservation.
Prevent unstarted commitments after cancellation is requested, and reconcile any action already in flight.

Customer refunds are separate from supplier refunds to the team's card.
The proposed service absorbs processor costs to preserve the agreed zero service fee and approved customer total.
The account owner must approve that funding arrangement before live use.
The team must also choose whether to advance customer refunds from a reserve or wait for supplier recovery.
Advancing is faster for the customer but exposes the team to delay or refusal; waiting requires a clear refund timeline.
Do not promise instant money arrival under either policy.

## Required decisions before live execution

- Confirm the payment account's eligibility for this business model and the account owner responsible for supplier funding and fees.
- Choose the refund timing and reserve policy.
- Select an actual venue and item with availability, final costs, cash-refund terms, and sufficient cancellation windows.
- Verify authorized login, secure checkout, any authentication challenge, and supplier confirmation extraction.
- Confirm the runtime, worker host, and shared contracts with the three developers.

These items do not prevent sharing the draft documents.
They do prevent calling the proposed live path verified.
