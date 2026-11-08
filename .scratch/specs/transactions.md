# Approve, pay, and cancel an event safely

Type: spec
Status: open
Label: ready-for-agent
Owner: Ujjwal
Scope: transactions, shared contracts, and backend integration

## Problem Statement

A host needs to approve and pay for one event without accidentally authorizing a changed plan, paying twice, or creating duplicate supplier commitments. If the host cancels while payment or approval is in flight, they need an honest result and any owed refund. A failed provider call must not disappear merely because payment was already recorded.

The team needs one authoritative backend contract so frontend and agent consumers share the same approval, payment, progress, and cancellation behavior.

## Solution

Keep the customer's event, research result, bookable plan, approval, payment, attempts, and progress in authoritative storage. Require explicit approval and verified payment before supplier execution. Derive stable execution identities on the server, resume interrupted payment handoffs, and reject approval when cancellation wins during Checkout creation.

Deliver a small hackathon flow with real research integration when verified, Stripe test payments and refunds, and clearly labeled simulated supplier actions. Publish an authenticated HTTPS MCP endpoint for Naive and verify its transport with a real ping before claiming that integration works.

## User Stories

1. As a host, I want only my signed-in account to access my event, so that another customer cannot change it.
2. As a host, I want research to retain my current brief and revision, so that an older result cannot replace my updated requirements.
3. As a host, I want research evidence distinguished from a bookable plan, so that missing costs or terms cannot become an approved purchase.
4. As a host, I want the exact actions, total, currency, and cancellation terms shown before approval, so that I know what I authorize.
5. As a host, I want a changed plan to require fresh approval, so that earlier consent cannot authorize new commitments.
6. As a host, I want one Checkout session attached to my stored approval, so that repeated approval requests do not create competing approvals.
7. As a host, I want cancellation that wins during Checkout creation to reject approval, so that I am not handed a payable link for the canceled event.
8. As a host, I want an unused Checkout session expired when possible, so that an interrupted approval does not leave an avoidable payment opportunity.
9. As a host, I want payment verified by the backend, so that a browser return URL cannot falsely mark my event paid.
10. As a host, I want late or revoked payments refunded without starting new supplier work, so that cancellation and approval expiry are respected.
11. As a host, I want a failed refund request retried with the same identity, so that a temporary provider error does not strand my payment or duplicate my refund.
12. As a host, I want interrupted execution handoffs resumed after payment, so that recording payment does not silently lose the work I paid for.
13. As a host, I want repeated tool calls to return existing attempts, so that retrying a request cannot create another purchase.
14. As a host, I want uncertain supplier outcomes reconciled before a retry, so that a missing response cannot cause a duplicate commitment.
15. As a host, I want cancellation to stop unstarted commitments and track existing commitments, so that one event cancellation reflects each supplier's result.
16. As a host, I want refund requests and provider-reported completion distinguished, so that the service does not promise money has arrived prematurely.
17. As a host, I want live, test, and simulated modes visible and enforced, so that a test payment cannot authorize a live purchase.
18. As an agent developer, I want guarded tools that accept event and action identities, so that the backend owns approval selection and execution keys.
19. As a frontend developer, I want shared event, progress, and Checkout responses, so that the interface does not infer authoritative state from fixtures or model prose.
20. As an integration owner, I want a public authenticated MCP ping and recorded verification, so that local unit tests are not mistaken for working Naive connectivity.
21. As an integration owner, I want small commits and explicit prerequisite PRs, so that integration can be reviewed and rolled back incrementally.
22. As a demo reviewer, I want agent decisions and human approvals distinguished, so that I can assess what the company actually accomplished.

## Implementation Decisions

- Preserve the merged TanStack Start and Bun application and contract 0.4. The backend owns authoritative storage and guards; Naive's durable sessions perform long agent work. Do not introduce a worker or queue.
- Ujjwal owns transactions, shared contracts, storage, and integration. Tony owns agent workflow and supplier integrations, Leo owns frontend, and Ferdinand owns pitch. Changes to shared contracts require review by affected consumers.
- Obtain customer identity through the server authentication boundary. MCP authenticates Naive with a shared bearer and resolves customer ownership from the event.
- Keep read-only ResearchResult evidence separate from a Plan. Approval requires the current revision, a defensible total, and known cancellation terms.
- Approval and Checkout share the same expiry, currently 31 minutes after creation. Store approval and payment together only after locking the event and checking its current plan revision and cancellation flag.
- If cancellation wins before persistence, return 409 with invalid_status, request expiry of the unused Checkout session, and save no approval or payment for that request. Provider expiry failure must not turn rejection into successful approval.
- Record verified provider payment state even if the approval was revoked. Eligibility for execution is a separate decision; late or revoked payment must not unlock new supplier work.
- Complete an owed execution or refund handoff before marking its delivery complete. Retry interrupted handoffs using stable approval, payment, execution, and refund identities.
- Derive each commitment or cancellation key from the stored approval, action, and operation. Claim commitments under the event lock so cancellation cannot overlook a newly started commitment.
- Reject live execution backed by test or simulated payment. Reconcile unknown supplier outcomes; do not automatically purchase again.
- Settle confirmed supplier cancellations before the final refund, account for retained supplier fees, and retain the provider's refund state. Do not infer completion from a requested refund.
- Persist cancellation and refund information on the existing event, payment, and attempt records. This follow-up adds no database migration or public schema change.
- Expose the existing JSON-RPC MCP transport over public HTTPS, test unauthorized access, and confirm an authenticated Naive ping. Plain JSON transport compatibility remains unverified until that check.
- Preserve the exact shared route-repair commit as an integration prerequisite. Keep deployment configuration and Tony's research integration in their existing PRs instead of duplicating those implementations here.

## Testing Decisions

- Use existing public service boundaries: customer event operations backed by migrated test storage, and signed Stripe webhook delivery with a controlled Stripe provider. These are the same boundaries already used for the approved local fixes.
- Assert observable outcomes: returned errors or Checkout URLs, stored event/approval/payment state, supplier work, refund arguments and identity, and replay behavior. Avoid assertions about private helpers or prompt wording.
- Reproduce cancellation completing inside fake Checkout creation before applying the fix. Then assert 409, an expiry request, canceled event state, and no stored approval or payment.
- Make the first refund request fail, replay the same signed webhook, and assert a full refund with the same idempotency key. A subsequent delivery must make no extra refund request or supplier commitment.
- Reuse the existing approval, payment-handoff, commitment-claim, cancellation, and MCP test suites for surrounding behavior. Run the full suite, typecheck, build, and whitespace checks on the integrated branch.
- Keep hosted verification separate: database migration, Stripe test Checkout/webhook/refund, public MCP authentication, and a Naive ping require their own runtime evidence. Controlled-provider tests do not establish any of those outcomes.

## Out of Scope

Live customer collection, live supplier purchases, supplier outreach, account provisioning, deployment without the required authorization, a new job system, framework migration, frontend redesign, and changes to Tony's research implementation are outside this patch.

Full crash recovery, unrestricted provider coverage, and separate refund or supplier-recovery schemas are not required for this hackathon increment. This spec does not imply exactly-once external delivery or that Stripe session expiry always succeeds.

## Further Notes

This spec synthesizes the existing product and transaction contracts and the approved local fixes. It is published through the repository's local specification tracker; ready-for-agent is its triage label, not evidence of deployment or team approval.

Contracts, Clerk, backend core, standalone research, fixture-backed frontend, route repair, deployment configuration, supplier evidence, research integration, and coordination CI are merged as of main ce2d672. The transaction follow-up remains on PR #28. Check current PR state and the owner's status before integrating later changes.

Real research currently returns partial results with unknown final costs and no bookable Plan. Rehearsing payment and booking therefore needs verified costs and terms or an explicitly labeled simulated path. Real execution/cancellation session starters remain unwired; selecting naive execution currently chooses placeholder hooks, while the scripted fallback is implemented. These are remaining integration tasks, not capabilities established by this spec.

The hackathon ends at 11:00 AM Pacific on November 8, 2026. Prioritize one working event flow with honest mode labels and evidence of agent decisions and human intervention.
