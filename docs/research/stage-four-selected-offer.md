# Selected offer and sandbox payment integration

Planning and transaction records share the configured database connection.
A customer can prepare an offer from saved venue replies and selected supply evidence, then explicitly create a linked transaction plan.
The server preserves selected option snapshots and quantities.
It calculates item subtotals, tax, delivery, fees and additional deposits using integer minor units.
Included deposits are counted once.
Unknown required charges and incomplete terms prevent payment preparation.
Offer evidence validation remains under review before release.

## Approval and payment timing

Before Checkout, the server checks the current offer, selected options, customer requirements and quote expiry.
A quote must cover the whole Checkout approval window.
The existing approval, Stripe Checkout and signed webhook path remains the only payment system.
Supplier execution is simulated, and a payment never proves a real reservation or purchase.

Migration 0004_payment_paid_at adds a nullable payment timestamp.
The signed payment webhook records Stripe's event time and preserves that value on replay.
A payment made before the approval and quote expire remains eligible if webhook delivery occurs later.
Legacy payments without this timestamp retain the previous expiry check until a matching signed payment event supplies it.

Once paid handoff starts, execution uses the stored approved transaction plan.
Later conversation edits and additional venue messages do not silently replace that plan or trigger a refund.
Plan identity, revision, payment amount, currency, action membership and explicit cancellation checks remain in place.
Cancellation continues through the existing cancellation and refund flow.
Changing the conversation is not cancellation.

## Local verification

The migrated database tests reproduce delayed webhook delivery, a venue acknowledgement during execution, and a customer conversation edit during execution.
All three failed before their fixes and now pass.
The same tests verify duplicate webhook handling, exact selected amounts, venue-before-supplies execution and rejection of a changed unpaid offer.
The focused offer, contract, webhook, execution and database run passes 139 tests, and typecheck passes.
These are local integration tests with controlled Stripe signatures and simulated supplier execution.
They are not a new live payment or a production verification.

## Remaining release gates

Finish evidence validation and remaining review findings.
Run the full required checks on the combined revision.
Repeat the customer journey in the independent browser testing session, including sandbox decline, success, signed webhook settlement and reload.
Test the additive migration on an isolated database before applying it to shared hosting.
Record hosted configuration, deployed revision and actual outcomes separately from local evidence.
