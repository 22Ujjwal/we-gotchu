# Ujjwal's stage-four and stage-five preparation

## Work that does not need the planner UI

Inspect `src/server/events/service.ts`, `src/server/payments/stripe.ts`, `src/server/payments/webhook.ts`, `src/server/execution/adapter.ts`, and `src/server/execution/simulated-adapter.ts`.
Record the current required plan and approval fields, supported statuses and existing tests.
Reuse those contracts rather than building another payment system.
Report a minimal selected-offer mapping to Tony.

Create an isolated, explicitly simulated complete offer for a sandbox check.
Use a synthetic customer/event fixture or the existing supported test setup, not a real customer record.
No supplier adapter may make real commitments in this check.
Do not change the live planner's output to make the fixture pass.

## Stage-four implementation and acceptance

Implement only backend changes needed to accept the versioned selected offer through existing approval rules.
Tony owns the planning-to-event mapping and customer approval UI.
Ujjwal owns payment internals, webhook handling and execution status behavior.
Coordinate shared contracts and schema before editing them.

Verify the approved currency, amount, selected items and quantities match the Checkout request.
Verify an expired or superseded offer cannot reuse an old approval.
Verify repeated approval or webhook delivery does not create a second payment execution.
Verify success, customer-abandoned Checkout and a failed payment through existing supported test mechanisms.
Do not treat the success return URL as evidence of payment.
Verify the signed Stripe webhook updates the same linked event and that reload restores the state.
Keep payment received separate from a simulated supplier commitment.
Refund functionality can reuse existing checks and does not need a new live demo segment unless changed.

Handoff includes exact commit, test-mode confirmation, sanitized Checkout and webhook references, observed database state, and anything not exercised through the signed-in UI.
An isolated sandbox check is not the integrated planning journey.

## Stage-five hosting preparation

Inventory required configuration names from the actual runtime without printing values.
Include authentication, database, planner, mail inbox/webhook, Stripe test keys/webhook, and public application URLs.
Record missing configuration, which owner supplies it, and the last verified deployment SHA.
Check migration ordering on an isolated database before applying it to hosted storage.
Never point a local fixture or reset script at the shared production database.
The development PGlite override is not proof of Neon readiness.

Prepare a deployment checklist with exact revision, migration command, configuration differences, webhook URLs and rollback procedure.
A rollback must account for migration compatibility; do not promise that a code rollback can undo a destructive migration.
Coordinate the deployment window with Tony and avoid simultaneous configuration edits.
Reuse existing infrastructure where possible instead of adding a queue or service speculatively.

## Hosted acceptance

Use one signed-in test customer and one clearly labeled test event on the exact deployment.
Verify research, selected venue, follow-up and reload first.
Then verify inquiry to the controlled inbox, close the browser, deliver a reply, and reopen to the saved offer.
Approve the labeled complete offer and finish one Stripe sandbox Checkout.
Verify the actual signed webhook, saved payment state and customer rendering agree.
Record exact deployment SHA and evidence for each step separately.
A provider outage or pending supplier reply must not become an unbounded spinner or a fabricated success.

## Demo and fallback

Aim for a two-to-four-minute recording with the genuine research result, preserved selection, outgoing inquiry or received quote, and approved sandbox payment if the integrated path passed.
Use a previously recorded genuine run when external services are slow.
Do not present a team-controlled reply as an actual supplier quote.
If stage four is incomplete, end at the real inquiry or quote status and keep any independent payment recording clearly separate.
No real booking or purchase claim is allowed without corresponding supplier evidence.
