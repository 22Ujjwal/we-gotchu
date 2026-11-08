# Transactions and integration handoff

Assigned teammate: Ujjwal.
Ujjwal owns transactions and integration under the shared ownership contract.

You own authoritative state, shared contracts, approval enforcement, customer authentication on the server, customer payments, refunds, execution-attempt records, and integration coordination.
Naive's durable agent session performs the long supplier work; our backend serves only short requests.
Hacking ends at 11:00 AM on November 8, 2026, so keep each deliverable minimal.
Read the [contract draft](../contracts-draft.md), [payment research](../research-index.md), and [ownership rules](ownership.md).

Start with the [foundation task](foundation.md) before the other developers integrate against shared schemas.
The [transaction specification](../../.scratch/specs/transactions.md) records the approval, payment, cancellation, and integration behavior and its testing boundaries.

## Hackathon deliverables, in order

Follow the [demo plan](demo-plan.md) and contract 0.4; these come before everything else in this brief.

1. Milestone 1: deploy the app to a stable public HTTPS URL with a bearer-checked stub MCP endpoint and a `ping` tool.
2. Milestone 3: contract 0.4 schemas and three fixtures.
3. Milestone 4: Neon tables, POST /api/events, GET /api/events/:id, PATCH /api/events/:id/brief, the `get_event` and `log_progress` tools, the research lease and stale-revision write, and Plan derivation, calling Tony's `startResearch` and `advanceResearch` for research.
4. Milestone 5: approve-and-pay with Stripe test Checkout, the webhook, and `execute_action` with the execution-key constraint.
5. Milestone 7: cancel, `cancel_action`, and the Stripe test refund.
6. The labeled fallback switches for simulated payment and the scripted agent.

## Deliverables

Publish versioned Zod schemas and fixtures for the other developers to review.
Persist events and revisions, research runs and results, plans, approvals, payments, attempts, evidence, and progress under contract 0.4. Cancellation and refund state live on the event, payment, and attempt records; separate supplier-recovery and refund records are deferred.
Enforce a database uniqueness constraint on the action execution key so a duplicate purchase cannot be recorded.
Implement API ownership checks, revision validation, stable idempotency, and webhook verification.
There is no separate worker process or job queue; do not add one.

Use the Clerk (@clerk/tanstack-react-start) customer authentication merged in PR #17.
Server code gets the customer id only through requireCustomerId() in src/server/auth.ts, which throws a 401-style error when signed out.
Ownership checks depend on that function, not on Clerk directly.
Keep keys in .env.local (gitignored) and document only the variable names VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.
The dev keys are temporary and must be claimed with `bunx clerk@latest auth login`.

Build the guarded MCP endpoint that Naive calls and that enforces approval before invoking supplier adapters.
Naive agents attach an external MCP server as {type:'url', name, url}; the URL must be public HTTPS, and localhost is refused, so local testing needs a tunnel or a deployed preview.
Authentication is a static bearer token stored in Naive's vault and injected server-side; the endpoint checks that shared secret, which identifies Naive and not a customer.
Each guarded tool call names the eventId and actionId; the endpoint finds the stored approval and derives the execution key, so the model cannot choose a fresh key.
The endpoint runs the supplier adapter itself and never trusts the model's claim of success.
Purchase tools are set to allow on the Naive side, so this endpoint is the only approval check.
Naive's ask confirmation is not used for the hackathon; revisit it if real money is used.
The implemented endpoint uses JSON-RPC methods `initialize`, `tools/list`, and `tools/call`, with plain JSON responses and notification handling. Whether Naive's client accepts this transport remains unverified until milestone 2.
Exclude /api/mcp and /api/stripe/webhook from the Clerk sign-in requirement.
Reconciling an unknown outcome is a plain guarded route or tool that the agent calls.
Coordinate root configuration and migration changes so other owners do not edit them independently.

Create one Stripe Checkout payment for the approved event total.
Verify provider payment state on the server and match it to the approval before executing supplier commitments.
Keep customer collection separate from supplier-card funding and supplier checkout.
Use stable action identities and reconcile unknown attempts before retrying.
Make cancellation stop unstarted commitments and coordinate cancellation of already confirmed commitments.
Track each supplier result and each refund independently.

## Live prerequisites

The account owner must confirm collection eligibility, supplier-card ownership, funding, and processor-cost responsibility.
Propose a refund reserve and state whether customer refunds are advanced or wait for supplier recovery.
Get agreement on that policy before live collection.
Keep the agreed service fee at zero and do not silently add processing fees to the customer's approved total.
Coordinate with the agent owner on secure payment entry and exact supplier terms.

## Acceptance

Duplicate commands, webhooks, and repeated MCP tool calls cannot produce duplicate commitments.
An MCP call with a missing or mismatched eventId or actionId is rejected; the backend finds the stored approval, validates it, and derives the execution key server-side.
A stale or revoked approval prevents execution.
A cancellation recorded before approval persistence rejects approve with 409, requests expiry of the unused Checkout session, and saves no approval or payment for that request.
A payment arriving after revocation does not trigger supplier purchases.
Webhook redelivery after an interrupted refund or execution handoff resumes the owed work using stable identities; a saved paid state alone does not prove that handoff completed.
Unknown outcomes trigger reconciliation rather than automatic retry.
Partial success remains visible and cannot be rolled back without applicable approval.
Refunds show provider state and available evidence rather than an assumed immediate completion.
A simulated customer payment cannot unlock live supplier execution.

## Copyable agent assignment

Implement the transaction and integration role after Tony and Leo review contract version 0.4.
Publish the schemas and fixtures first so frontend and agent work can proceed independently.
Own the shared files and coordinate requested changes from consumers.
Keep the first PR minimal because hacking ends at 11:00 AM on November 8, 2026.
Do not add a worker process or job queue; the guarded MCP endpoint and Stripe webhooks are the only long-lived backend surfaces.
Obtain the customer id only through requireCustomerId() in src/server/auth.ts, and never write secret values into documents or commits.
Do not perform live purchases, outreach, or payment operations merely to validate the implementation without the required explicit action approval.
