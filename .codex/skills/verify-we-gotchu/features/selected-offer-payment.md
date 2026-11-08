# Selected offer and sandbox payment

The controlled local journey passed through real Stripe sandbox Checkout and a provider-signed webhook on `b43db34`.
The browser observed abandonment, explicit card decline, successful test payment and reload with one simulated supplier execution.
The successful webhook required an official resend after correcting a duplicate local signing-secret assignment.
This proves neither natural retry timing nor real supplier procurement.

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
Run `NODE_ENV=development bun --env-file=.env.local tools/local-rehearsal/payment-preflight.mjs` from the checkout, using the installed Bun path if necessary.
It checks local mode, test-key format, a signing secret and duplicate environment assignments without printing values.
It does not verify provider access or prove that the signing secret belongs to the endpoint.
Privately compare the loaded secret with the temporary endpoint secret before starting the server.
The event routes and webhook must use the same local database owner as planning.
Do not deploy, apply hosted migrations, or reset the saved database.
For an authorized temporary HTTPS tunnel, start Vite with `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` set to that tunnel's hostname.
Do not allow arbitrary hosts.
An unsigned external POST reaching the Stripe handler should return 400 for the missing signature; this verifies routing, not signed delivery.

Click Prepare selected offer once.
Capture the command, saved offer ID/revision, source reply ID and selected option IDs.
Verify that a USD 50 deposit included in a USD 200 room price does not produce USD 250.
Unknown tax, delivery or required fees must prevent a complete payable total.
Read Supporting wording and compare it with the original reply and saved supply evidence.

For an explicitly complete controlled offer, click Review sandbox payment once.
Capture the linked event ID, plan ID and offer revision.
Verify displayed quantities and complete total against the offer.
The approval button must remain disabled until the approval checkbox is selected.
Approve once and record the exact test Checkout session reference without credentials.
Confirm the retrieved Checkout has `livemode: false`, the expected amount and currency, and that the page says Sandbox.
Use only a Stripe test payment method for the authorized sandbox check.
For the documented generic decline test use `4000000000000002`; for success use `4242424242424242`, a future expiry and synthetic billing data.
If optional Link enrollment asks for a phone, uncheck the save-information option instead of entering a real phone number.
A timed-out Card accordion click is not a payment attempt; inspect the page before retrying that interaction.
A timed-out Pay action requires read-only provider reconciliation before another submission.

Checkout must return to the same /planning/$id URL.
A success query parameter is not proof of payment.
Observe the signed webhook update and saved payment state before reporting payment received.
The screen must identify sandbox payment and simulated supplier execution separately.
Reload and compare the linked event, plan, payment and selected offer.
An abandoned unpaid Checkout can be reopened, and an explicitly declined card can be replaced in that same Checkout.
Verify reopening reuses the session without creating a duplicate approval or payment.
Use a new controlled record when testing an independent successful purchase case.
Verify duplicate approval and duplicate signed webhook handling without another logical execution.
Change the selected offer or expire it and confirm the old plan cannot authorize a new commitment.
Record source data and expected amounts, not only screenshots of the final screen.

If the success return remains pending, retrieve the exact Checkout and payment intent read-only.
Record provider payment status separately from saved application state.
Inspect the matching `checkout.session.completed` event and configured test webhook endpoint.
Do not submit another payment to repair a missing webhook.
Stripe sandbox retries can take hours; an authorized `stripe events resend EVENT_ID --webhook-endpoint=ENDPOINT_ID` requests a real signed redelivery of the original event.
Pass the test key through the process environment, never a logged command argument.
Do not construct a replacement success payload or sign one locally and call it provider evidence.
After redelivery, capture the saved payment ID, intent ID, amount, event status, attempt IDs, modes and provider references.
Reload and confirm there is still exactly one logical simulated execution.
See [Stripe webhook delivery behavior](https://docs.stripe.com/webhooks#event-delivery-behaviors) for retry rules.

## Gotchas

Customer notification email is disabled in explicit local mode.
Supplier execution uses the labeled simulated path in local mode.
An empty or uncertain mail outcome must not be replaced with a fabricated supplier quote.
Offer extraction checks source quotations but still requires review of their meaning and numbers.
Do not claim actual supplier acceptance, stock or reservation from this sandbox journey.
Record missing webhook delivery or provider access as an unverified boundary.
Stop only owned servers and tunnels after the run, and preserve screenshots and sanitized evidence.
Remove only temporary test webhook endpoints created for this run and restore prior local signing configuration privately.
Do not remove an endpoint while another authorized check still depends on it.
