# Architecture draft

Status: proposed for team review, not an approved implementation or verified live integration.
This draft uses the [research evidence](research-index.md), [product baseline](product-spec.md), and [stack proposal](stack-proposal.md).
All four teammates have sponsor benefits according to Tony; credit budget is not a stack constraint.

## Proposed components

Keep the existing TanStack Start, TypeScript, React, Tailwind, and Bun application as one package.
Use src/routes/api for server route files and src/contracts for browser-safe shared schemas.
Keep server implementations under src/server, agent code under src/agent, and supplier integrations under src/suppliers.
There is no separate worker process and no job queue in this proposal.
Bun workspaces are not required for this baseline.
Customer authentication uses Clerk through @clerk/tanstack-react-start, currently on a local unmerged branch.
Server code reads the signed-in customer only through requireCustomerId() in src/server/auth.ts.
Deployment hosting remains to be verified against the chosen build and the public HTTPS requirement for the MCP endpoint.
Prefer free or hosted services that are easy and common at hackathons, such as Clerk, Stripe Checkout, and Neon, over custom infrastructure.
Neon, Vercel, and Render appear in the hackathon sponsor list; this draft does not assume any credits or benefits for them beyond what is separately confirmed.
Use Neon Postgres with Drizzle for authoritative state and migrations.
Use shared Zod schemas for API and tool inputs and outputs.
Use Vitest for approval and transaction behavior.
Playwright journey tests are deferred until after the hackathon; the demo rehearsal is the journey test.
Pin versions when implementation starts after checking compatibility.

Use Naive's managed-agents SDK with hosted pi as the proposed agent runtime.
Fund that runtime with Naive credits.
Keep direct OpenAI usage optional until there is a concrete task that benefits from a separate model call.
This avoids making undocumented OpenAI BYOK support a prerequisite.
Check the account's available runtime capabilities before relying on pi approvals or streaming.
No Naive session has been run from the team's account yet, so the first Naive milestone in the [demo plan](team/demo-plan.md) is a hello-world session that calls our endpoint.

Use Monid for useful research tools after verifying the specific tools and their outputs.
Use AgentMail when a selected supplier genuinely needs email communication.
Keep mobile execution behind a supplier adapter and evaluate Mobilerun only for a supplier that needs it.
No sponsor integration is required solely to pursue a prize.

## Boundaries

The browser reads and submits commands through the application API.
It never writes transaction state directly or calls supplier purchase tools.
The agent gathers evidence and proposes actions through an authenticated HTTPS MCP service owned by the transaction backend.
Naive attaches this endpoint as an external MCP server.
Authentication is a static bearer token held in Naive's vault and injected server-side; it identifies Naive and not a customer.
Each guarded call names the eventId and actionId; the endpoint finds the stored approval and derives the execution key itself, so the model cannot choose a fresh key.
The transaction service checks the customer, event, plan revision, action approval, cancellation state, and execution identity before a supplier mutation.
The model cannot authorize its own actions or mark its own purchase successful.
The supplier adapters in src/suppliers run inside the backend's execute_action and cancel_action tools, and the backend records the adapter's result rather than a result reported by the model.
A supplier that can only be driven through Naive's browser would need a different, agent-reported evidence path and is out of scope for the demo.

Naive matches a vault static_bearer credential to the exact MCP server URL it was stored for, so the MCP endpoint needs a stable public HTTPS URL; a tunnel URL that changes on restart breaks authentication.
Source: [Naive vault](https://usenaive.ai/docs/identity/vault.md) and [tools](https://usenaive.ai/docs/capabilities/tools.md).
The Clerk middleware must not require a signed-in customer on /api/mcp or /api/stripe/webhook; those routes authenticate with the bearer token and the Stripe signature instead.

Purchase tools are set to allow on the Naive side, so the transaction backend's endpoint is the only approval check.
Naive's call-scoped ask confirmation is not used for the hackathon; revisit it if real money is used.
One customer approval can cover both named supplier actions, with each tool call matched to that stored approval.
Do not grant broad session-wide permission to purchase beyond that per-call match.
SDK or browser write permissions do not replace the application approval check.

Naive's agent session is durable and performs the long work of research and deciding what to call, so the backend needs no worker or job queue.
The backend starts one Naive session per phase through functions Tony provides in src/agent: research when the event is created, execution when the Stripe webhook confirms payment, and cancellation when the customer cancels.
Starting a session is a short API call, so it fits inside those requests.
The backend serves only short requests: Stripe webhooks and the guarded MCP endpoint that Naive calls.
Store the action attempt before the supplier call.
A database uniqueness constraint on the action execution key, together with the attempt row, prevents a duplicate purchase if a call is repeated.
Unknown outcomes are reconciled through a guarded tool that the agent calls, and an unknown purchase is never retried as a new purchase.
Keep each backend request short and do not hold a request open through supplier replies.
The simulated adapter returns immediately; a live supplier call must also finish within one request or stay out of the demo.
The transaction owner owns the MCP endpoint and webhook handlers; the agent owner supplies the supplier adapters they call.
No MCP endpoint, webhook handler, or deployment is implemented by these documents.

Persist progress with a monotonically increasing event sequence.
The UI can poll after its last sequence and rebuild from the latest event snapshot.
Every state-changing MCP tool stores the agent's stated reason as a progress entry, which is how the demo shows what the agent decided.
Naive stream cursors are internal runtime state and are not the customer event sequence.
An idle agent awaiting approval does not mean the event is complete.

## Payment proposal

Collect one combined payment through Stripe Checkout for the approved plan total.
For the hackathon, use Stripe test mode unless every live prerequisite below is met; test payments are labeled `test`, not `live`.
Create the Approval and Checkout session in one request with the same expiry, because Stripe requires a Checkout `expires_at` between 30 minutes and 24 hours after creation ([Stripe](https://docs.stripe.com/api/checkout/sessions/create)).
When the customer cancels before paying, expire the open Checkout session so a late payment is unlikely.
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

## Hackathon timing

Hacking ends at 11:00 AM on Nov 8, 2026.
Judges focus on how much of the company runs without the team.
The demo should show agents doing the work and show where a person approved or stepped in.
Build one simulated end-to-end path first, and add live supplier steps only after that path works.
The ordered milestones, owners, and fallbacks are in the [demo plan](team/demo-plan.md).

## Required decisions before live execution

- Confirm the payment account's eligibility for this business model and the account owner responsible for supplier funding and fees.
- Choose the refund timing and reserve policy.
- Select an actual venue and item with availability, final costs, cash-refund terms, and sufficient cancellation windows.
- Verify authorized login, secure checkout, any authentication challenge, and supplier confirmation extraction.
- Confirm the runtime and shared contracts with the three developers.
- Provide a stable public HTTPS URL for the MCP endpoint; Naive refuses localhost, and the vault credential is bound to the exact URL, so use a deployment or a reserved tunnel domain.

These items do not prevent sharing the draft documents.
They do prevent calling the proposed live path verified.
