# Stage-four selected offer integration

## Current local state

Work is on `feat/planning-offer-checkout`, based on the local Stage 3 branch at `dc1bf1f`.
Stage 3 still needs deferred live mail verification.
No branch has been pushed or deployed for this stage.

The first implementation converts a server-saved structured offer to the existing transaction Plan contract.
It preserves the exact selected option snapshots and quantities.
It sums item subtotals, tax, delivery, required fees and explicitly additional deposits.
An included deposit is not added again.
Unknown required charges, unresolved requirements, changed selections, changed customer message context, expired offers and totals over budget prevent conversion.
All generated supplier actions use simulated execution.
Four focused checks and typecheck passed at `94e2d11`.
These checks establish conversion behavior only, not a working Checkout journey.

## Remaining implementation

Persist a versioned offer alongside its inquiry and source reply.
Generate it from saved supplier evidence and selected supply evidence without treating narrative summary text as a payment amount.
Retain incomplete offers for display, including their missing fields.
Customer input must not directly set a server-trusted payable total.

Atomically link the current conversation revision and selected offer to one existing transaction event and plan.
Duplicate requests must return the same link.
A changed selection, brief, source reply or offer revision must invalidate an old unapproved mapping.
Approval must recheck the linked offer revision and expiry rather than trusting only the earlier conversion result.
The existing transaction backend remains responsible for approval, Checkout and signed payment webhook handling.

Use the same local file-backed database owner for planning and transaction storage.
The legacy runtime currently opens Neon from DATABASE_URL, while local planning uses PGlite.
The integrated local payment path must not accidentally write to that shared database.
Do not instantiate a second PGlite owner for the same directory.

Render the selected offer, complete total and terms before explicit sandbox approval.
Keep missing-cost offers visible without a payment control.
Restore the linked payment state after reload.
Payment received and simulated supplier execution must remain separate visible outcomes.

## Deferred live verification

Use a clearly labeled complete controlled offer for the first sandbox journey.
Verify selected IDs, quantities, currency, included deposit and total at the offer, plan, approval and Checkout boundaries.
Verify changed and expired offers, duplicate approval, duplicate webhook, successful payment, failed payment and abandoned Checkout.
Require signed webhook evidence for paid status.
A success redirect alone does not prove payment.
Repeat the local browser journey in the existing independent testing session after the user resumes live checks.

## Storage and approval progress

The shared storage factory now exposes planning, offer and transaction repositories using the same database connection.
Offer storage retains incomplete offers, checks the current inquiry and reply, and rejects stale generation results.
Payment preparation locks the conversation and creates the linked event, completed research run and transaction plan in one database transaction.
Concurrent preparation returns the same event and plan.
This remains an internal repository operation, not a public customer endpoint.

Plans retain their originating conversation and offer revision.
The existing approval service rechecks that saved offer before Checkout creation.
The database repeats the check while saving approval and before claiming supplier execution.
Changed selections, customer instructions, source replies, financial terms or expiry invalidate the linked plan.
New Checkout creation also requires the quote to cover the existing payment window.
The focused event, offer and database checks passed 72 tests before the additional expiry-window regression.
The later expiry-window and offer-storage checks passed 33 tests.

Offer generation from actual saved evidence, customer offer display, local runtime wiring, payment endpoint integration and the complete browser journey are still pending.
No real payment or provider call occurred in these checks.

## Offer extraction and customer review

Offer preparation now uses the configured model to extract a structured offer from the saved reply, customer messages and selected option evidence.
The application assigns offer identity, revision and source identity, preserves selected snapshots, and rejects quotations absent from the corresponding saved evidence.
The customer cannot submit a payable price through this command.
Missing required charges remain null and prevent a complete total.
A completed request replays its saved result without another model call.
Concurrent model calls can still perform duplicate read-only extraction, but only the current conversation version can save a result.

The customer view shows quantity, quoted price, tax, delivery, fees, deposit treatment, cancellation terms, supporting wording and missing requirements.
The review and transaction builder share the same cost calculation.
The offer component and existing chat checks passed 33 DOM tests, and typecheck passed.
The extractor checks used a controlled completion response, not a live model call.
The customer approval action, local transaction runtime and real browser/payment checks remain unfinished.
