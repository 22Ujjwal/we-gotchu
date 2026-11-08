# Tony's planner and customer work

## Stage three, draft first

Start from reviewed stage-two code and a saved conversation with a selected venue.
Keep the current proposal and selected supply snapshots intact.
Create a stable inquiry identity and draft revision attached to that conversation.
Generate the draft from the current brief and venue, asking only for missing facts that affect the customer's decision.
Find a published contact and retain its source, or show that contact information is missing.
Never invent an email address.

Let the customer edit recipient, subject and text, then save and reload the draft.
Changing the venue or material brief facts makes an old draft stale.
Ordinary public research does not ask for another approval.
Approval covers the exact outgoing message and recipient, and does not authorize payment or booking.
Wire the transport only after persisting approval and operation intent.

## Reply interpretation

Consume Ujjwal's normalized incoming message through the agreed callback.
Persist the original message before interpretation.
Classify a question, refusal, tentative availability, quote, or reservation confirmation separately.
Extract only supported price, currency, date/time, capacity, deposits, required charges, terms and expiry.
Keep missing information unknown and show the source message reference.
A supplier asking a question should produce a useful next action, not a fabricated complete offer.

Keep unrelated selections unchanged.
An older reply must not silently overwrite a newer offer.
A duplicate must not append the same customer message again.
Interpretation failure should leave a received-but-not-interpreted state that can be recovered without sending another inquiry.
Persist results while the customer tab is closed through the agreed durable processing mechanism.

## Customer UI

Show the saved draft, review/send action, actual send status, waiting-for-reply state, incoming reply summary and offer on the same conversation.
Keep private provider diagnostics out of the main customer copy.
Expose a source reference or expandable original message where appropriate.
Do not show progress percentages that are not measured.
Preserve the current design; activity animation refinements are deferred.

## Stage-four bridge

Reuse the existing approval and transaction backend after Ujjwal verifies its required fields.
Map the customer's exact selected venue, supply IDs, quantities and complete quoted costs into a versioned plan.
Do not silently substitute the highest-ranked option.
If a planning conversation maps to a legacy event record, persist that mapping once and restore it on reload.
Repeated attempts must not create a second transaction event.

The review screen must show the amount and terms the backend will approve.
A changed offer invalidates prior approval.
An incomplete offer shows what is missing instead of opening Checkout with a guessed amount.
A simulated offer used for the demo stays labeled through approval, payment and supplier outcome screens.

## Acceptance

Use the combined verification runbook after isolated draft and interpretation checks.
Verify a changed draft, a supplier question, missing currency, a complete controlled quote, duplicate reply, and preserved selected supplies.
Then verify the same chosen offer reaches sandbox Checkout and returns to the same conversation or explicitly linked event.
Retain separate proof for supplier confirmation; payment alone is insufficient.
