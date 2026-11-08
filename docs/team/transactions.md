# Transactions and integration handoff

Assigned teammate: Ujjwal.
Ujjwal owns transactions and integration under the shared ownership contract.

You own authoritative state, shared contracts, approval enforcement, customer payments, refunds, durable execution, and integration coordination.
Read the [contract draft](../contracts-draft.md), [payment research](../research-index.md), and [ownership rules](ownership.md).

Start with the [foundation task](foundation.md) before the other developers integrate against shared schemas.

## Deliverables

Publish versioned Zod schemas and fixtures for the other developers to review.
Create database records for event revisions, approvals, jobs, action attempts, evidence, customer payments, cancellations, supplier recoveries, and customer refunds.
Implement API ownership checks, revision validation, stable idempotency, and webhook verification.
Build the worker entrypoint and authenticated MCP endpoints that enforce approval before invoking supplier adapters.
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

Duplicate commands, webhooks, and job delivery cannot produce duplicate commitments.
A stale or revoked approval prevents execution.
A payment arriving after revocation does not trigger supplier purchases.
Unknown outcomes trigger reconciliation rather than automatic retry.
Partial success remains visible and cannot be rolled back without applicable approval.
Refunds show provider state and available evidence rather than an assumed immediate completion.
A simulated customer payment cannot unlock live supplier execution.

## Copyable agent assignment

Implement the transaction and integration role after the team approves contract version 0.1.
Publish the schemas and fixtures first so frontend and agent work can proceed independently.
Own the shared files and coordinate requested changes from consumers.
Do not perform live purchases, outreach, or payment operations merely to validate the implementation without the required explicit action approval.
