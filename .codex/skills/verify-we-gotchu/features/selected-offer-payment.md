# Selected offer and sandbox payment

This recipe is a draft until the integrated browser run passes.
The implementation has controlled tests; no live Checkout result is implied.

## Sub-features

Prepare a versioned offer from a saved venue quote and selected supplies.
Review quantities, source wording, required charges, deposit treatment and missing requirements.
Prepare one linked transaction plan, explicitly approve it, and open existing Stripe sandbox Checkout.
Return to the same conversation and restore authoritative payment state.

## How to get to it (user POV)

Open the saved /planning/$id conversation while signed in as its owner.
Select the quoted venue and any required supply options.
Use a clearly labeled controlled quote for the first complete payment test.
A real partial quote must stay incomplete; do not edit it to force a payment control.

## Driving it with the shared preview

Record the exact HEAD and confirm the explicit local planning database override.
Verify configuration names privately and confirm the Stripe key is test mode without printing it.
The event routes and webhook must use the same local database owner as planning.
Do not deploy, apply hosted migrations, or reset the saved database.

Click Prepare selected offer once.
Capture the command, saved offer ID/revision, source reply ID and selected option IDs.
Verify that a USD 50 deposit included in a USD 200 room price does not produce USD 250.
Unknown tax, delivery or required fees must prevent a complete payable total.
Read Supporting wording and compare it with the original reply and saved supply evidence.

For an explicitly complete controlled offer, click Review sandbox payment once.
Capture the linked event ID, plan ID and offer revision.
Verify the displayed quantities and complete total against the offer.
The approval button must remain disabled until the approval checkbox is selected.
Approve once and record the exact test Checkout session reference without credentials.
Use only a Stripe test payment method for the authorized sandbox check.

Checkout must return to the same /planning/$id URL.
A success query parameter is not proof of payment.
Observe the signed webhook update and the saved payment state before reporting payment received.
The screen must identify sandbox payment and simulated supplier execution separately.
Reload and compare the linked event, plan, payment and selected offer.

Repeat with an abandoned Checkout and a failed test payment using separate controlled records.
Verify duplicate approval and duplicate signed webhook handling without creating another logical execution.
Change the selected offer or expire it and confirm that the old plan cannot authorize a new commitment.
Record source data and expected amounts, not only screenshots of the final screen.

## Gotchas

The customer notification email is disabled in explicit local mode.
The supplier execution hook is the labeled simulated path in local mode.
An empty or uncertain mail outcome must not be replaced with a fabricated supplier quote.
Offer extraction checks source quotations but still requires review of their meaning and numerical interpretation.
Do not claim actual supplier acceptance, stock or reservation from this sandbox journey.
Record missing webhook delivery or provider access as an unverified boundary.
