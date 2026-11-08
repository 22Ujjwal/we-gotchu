# Supplier payment feasibility

Status: draft research and team handoff, checked November 7, 2026.
This report follows [the glossary](../../GLOSSARY.md), [the proposed stack](../stack-proposal.md), [ADR 0002](../adr/0002-limit-hackathon-scope-and-require-action-approval.md), and [the research question](../../.scratch/event-demo/issues/02-supplier-payments.md).
Only public documentation and local planning files were inspected.
No account access, secret reads, supplier outreach, signups, bookings, purchases, or live payment tests occurred.

## Recommendation

Use one Stripe Checkout payment for the approved event total, then execute two separate supplier transactions using an already available, independently funded business payment card.
Prefer an existing eligible card over making a new card program a demo dependency.
Use Stripe Issuing only if the team already has live access, an approved use case, and sufficient available Issuing funds.
Treat this as a conditional design, not a verified live path.
No specific venue, item, supplier account, card acceptance, or cancellation outcome has been verified.

Select one venue and one inexpensive item whose actual terms permit cancellation within the customer's limits, and establish their checkout and cancellation procedures before collecting money.
Prefer suppliers that explicitly support a reservation or fulfillment delay long enough to cancel, rather than assuming an order can be stopped immediately after purchase.
Use a supplier API where the selected supplier actually offers authorized access, otherwise evaluate Naive browser automation against that exact checkout.
Do not promise unattended checkout until login, payment entry, authentication challenges, and confirmation extraction work for those suppliers.
If any prerequisite remains unresolved, use the ADR's explicitly labeled simulation fallback.

This recommendation preserves the agreed combined payment and zero service fee.
The team would advance supplier funding and absorb payment-processing costs unless the customer approves a revised pricing policy.
It does not establish that collecting customer money and purchasing on their behalf is permitted for the team's existing payment account.
The account owner must resolve the business model, merchant responsibility, and provider eligibility before live use.

## What each system actually does

| Responsibility | Candidate mechanism | Evidence boundary |
| --- | --- | --- |
| Customer action approval | Application approval tied to the exact plan revision and both supplier commitments. | This grants permission; it is neither a card authorization nor a reservation. |
| Customer collection | Stripe Checkout collects the combined amount. | Payment success proves collection, not supplier fulfillment. |
| Supplier funding | Existing funded business card, or eligible and funded Stripe Issuing account. | Customer collection does not establish immediately spendable supplier funds. |
| Supplier checkout | Selected supplier API or verified browser flow. | Supplier booking and order references establish acceptance. |
| Supplier cancellation | Each supplier's actual cancellation procedure. | A request is not a completed cancellation. |
| Supplier money recovery | Card authorization reversal or supplier refund. | This restores funds to the supplier payment method, not the customer's Checkout payment. |
| Customer refund | Refund against the original Stripe customer payment. | Track its provider status independently from supplier recovery. |

The distinctions above are design conclusions drawn from [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page), [Issuing funding](https://docs.stripe.com/issuing/funding/balance), [Issuing authorizations](https://docs.stripe.com/issuing/purchases/authorizations), and [customer refunds](https://docs.stripe.com/refunds).

## Naive findings

### Cards cannot be the live funding dependency

The official [card guide](https://usenaive.ai/docs/identity/cards.md), [card API](https://usenaive.ai/docs/api/cards.md), and [card SDK](https://usenaive.ai/docs/sdk/cards.md) explicitly say hosted card issuing is not configured and returns `501 feature_not_configured` for quoting, issuing, retrying, and credential reveal.
This is stronger evidence than the [marketing page's virtual-card illustration](https://usenaive.ai/primitives/cards).
Do not infer availability from a published SDK method.

The planned model purchases a prepaid card from organization credits with a one-time load, rather than automatically spending a Stripe customer collection.
The card guide describes load bounds of $1 to $150 and no reloads.
It explicitly says `card.spend` records spending without moving money, and there is no live authorization feed.
Its `cancel` action retires a card locally, while `refund` returns credits for undelivered issuance rather than canceling a merchant purchase.
These semantics rule out using the local spend ledger as proof of supplier payment or the card refund endpoint as a supplier refund mechanism.
Source: [Naive card lifecycle and agent tools](https://usenaive.ai/docs/identity/cards.md).

The SDK names `client.identities.cards.quote`, `issue`, `get`, `revealCredentials`, `cancel`, `refund`, `logTransaction`, and `transactions`.
The SDK documentation warns that each write generates a fresh idempotency key by default, so retrying issuance requires reusing the original key explicitly.
No credentials were requested during this research.
Source: [Naive card SDK](https://usenaive.ai/docs/sdk/cards.md).

### Wallet and credits are not interchangeable

The [wallet guide](https://usenaive.ai/docs/identity/wallet) marks the wallet as unavailable, Phase 5, and says not to build on it yet.
Its planned USDC wallet supports x402 payments and transfers, with separate testnet and owner-enabled mainnet wallets.
The guide separates wallet funds from credits used for inference, compute, browser, and storage.
Neither an x402 receipt nor a Naive credit balance establishes a way to pay a conventional venue or retailer card checkout.
The separate planned card product's credit-funded issuance does not make wallet funds, platform credits, and customer receipts the same balance.

### Browser support is useful but not supplier integration proof

The [browser SDK](https://usenaive.ai/docs/sdk/browser.md) documents `client.computers.browser(id)` with `goto`, `click`, `type`, `act`, `extract`, `observe`, `links`, and `screenshot`, plus dedicated login and saved-context operations.
It returns action results and screenshot file references, which can support evidence collection.
A successful browser action proves an interaction ran, not that a supplier accepted a booking.

The [browser guide](https://usenaive.ai/docs/computer/browser.md) requires `allow_writes` for write-like actions and a dashboard-granted saved login for reuse.
Saved-login extraction also requires `allow_extract` and redacts sensitive patterns.
Credential-shaped input is refused through ordinary `type` and `act` actions, and dedicated login reads credentials from the vault.
The reviewed guide does not establish a general secure payment-card injection mechanism for arbitrary supplier checkout.
Card entry and any 3-D Secure or other challenge therefore remain explicit integration prerequisites, not assumed browser capabilities.

The guide's `ask_actions` setting applies to the agent browser tool, not browsers opened over REST.
Consequently, the application must enforce the customer's plan-bound approval before every external commitment regardless of the chosen SDK route.
Browser write permission alone is broader than permission to buy these two specific things.
Source: [Naive browser configuration and guards](https://usenaive.ai/docs/computer/browser.md).

## Stripe findings and alternatives

### Checkout collects once

Checkout supports a payment session containing line items and a combined amount.
Use the actual venue cost, item cost, taxes, delivery, and any supplier platform fees in the approved breakdown, with our service fee explicitly zero.
Server-side fulfillment must verify payment status and tolerate duplicate or concurrent delivery of the same session.
Do not fulfill solely because the customer reached a success URL.
For the narrow demo, prefer card payments and avoid introducing delayed-payment methods.
Sources: [Checkout session construction](https://docs.stripe.com/connect/separate-charges-and-transfers.md?platform=web&integration=checkout&ui=stripe-hosted) and [fulfillment requirements](https://docs.stripe.com/checkout/fulfillment.md?ui=full-page).

### Connect works only with participating suppliers

Separate charges and transfers can allocate one platform payment to multiple connected accounts.
It is a plausible alternative if both suppliers already participate in the platform and accept that settlement arrangement.
It does not buy inventory or reserve a room at an arbitrary merchant checkout.
The platform balance bears Stripe fees, refunds, and chargebacks under this charge model.
The benefit is explicit payment allocation; the cost is supplier onboarding, account eligibility, and separate booking integration.
Source: [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers.md?platform=web&integration=checkout&ui=stripe-hosted).

A transfer reversal returns money from a connected account to the platform and can require sufficient destination balance.
It is distinct from refunding the customer and does not cancel a supplier booking.
Track customer refunds and transfer reversals separately rather than assuming one operation completes both.
Source: [Stripe transfer reversals](https://docs.stripe.com/api/transfer_reversals).

### Issuing is a supplier payment option with separate prerequisites

Stripe Issuing creates business payment cards, with availability dependent on country and program.
Its documentation also provides test purchase simulation, which is not a real supplier purchase.
Source: [Stripe Issuing overview](https://docs.stripe.com/issuing).

Issuing requires a funded Issuing balance that is separate from earnings and payouts.
Funding methods and timing vary by region, so do not assume a fresh Checkout receipt can immediately fund the next supplier charge.
Prefunding avoids making settlement timing part of the live demonstration.
Source: [Stripe Issuing balance](https://docs.stripe.com/issuing/funding/balance).

An approved supplier card authorization reserves funds; capture creates a transaction, while a void can reverse the authorization and release the hold.
These are payment states, not supplier reservation states.
Source: [Stripe Issuing authorizations](https://docs.stripe.com/issuing/purchases/authorizations).

Captured supplier refunds appear as Issuing transactions of type `refund`, and Stripe cannot always link them to the original authorization.
Card deactivation does not cancel the supplier order or prevent capture of a previously approved authorization.
Keep supplier order references and monetary evidence together for reconciliation.
Source: [Stripe Issuing transactions](https://docs.stripe.com/issuing/purchases/transactions).

### Customer refunds are another operation

Refund the original customer PaymentIntent for the approved refundable amount, independently of supplier-card recovery.
Stripe uses available balance, and card refunds can remain pending if that balance is insufficient.
Original processing fees are not returned.
An uncaptured customer authorization is canceled rather than refunded, which must be described differently from a completed payment followed by a refund.
Source: [Stripe refunds and payment cancellation](https://docs.stripe.com/refunds).

Recommendation: hold a separate refund reserve and decide whether the service advances customer refunds or waits for supplier recovery.
An advance gives the customer a faster result but exposes the service to supplier delay or refusal.
Waiting reduces that exposure but requires a clear customer-facing delay and does not guarantee all refunds finish during the demo.

## Supplier selection evidence

Peerspace is an example to investigate, not a selected or available venue.
Its published cancellation policy offers a grace period within 24 hours after booking confirmation when the event is at least 48 hours away.
The policy also distinguishes original-payment refunds from Peerspace Credit, and its Very Flexible option explicitly permits an original-payment refund within its deadline.
Confirm the exact listing policy, deadline, refund destination, fees, and reservation acceptance before presenting a refundable total.
Source: [Peerspace cancellation policy](https://www.peerspace.com/legal/terms/cancellation-policy).

Peerspace requires cancellation through the booking account, including a reason and host message; merely messaging support or the host is insufficient.
Its help page allows 7-10 business days for a refund to appear.
Any required cancellation message must fall within the customer's action approval in a later live run.
Source: [Peerspace cancellation procedure](https://support.peerspace.com/en/articles/10119171-how-do-i-cancel-a-booking).

Walmart is an example of why a cheap item is not automatically a suitable cancellation demo.
Its help page describes requesting cancellation and says edit or cancellation options can be unavailable.
Do not equate a retailer's return policy with guaranteed pre-fulfillment cancellation.
Select an actual item and fulfillment method only after its cancellation window and confirmation procedure are established.
Source: [Walmart order edits and cancellation](https://www.walmart.com/help/article/edit-or-cancel-walmartn-order/2c7e3d99812044f8aaa65aee0eae3d1c).

## Proposed coordinated execution and evidence

These are proposed application requirements, not claims that an existing implementation provides them.

1. Present a versioned event plan naming both suppliers, venue date and time, item and quantity, all costs, currency, exact cancellation deadlines with time zones, refundable amounts, and approved loss limits.
2. Record one customer approval covering both commitments and any necessary supplier communication, then collect one combined Checkout payment.
3. Verify payment and approval validity, recheck availability and price, and execute the venue reservation before the dependent item purchase.
4. Stop and obtain revised approval if the plan changes beyond the approved bounds, and never silently spend more or substitute a supplier.
5. Store each supplier's confirmation independently, then show one event summary with both results.
6. On one event cancellation request, prevent unstarted actions and attempt each permitted supplier cancellation independently.
7. Continue the other cancellation if one is blocked, then report unresolved commitments and request any additional authorization required by the ADR.
8. Reconcile supplier reversals or refunds and issue the applicable customer refund without describing pending money as received.

The two purchases are not atomic.
If the venue succeeds and the item fails, use only an explicitly approved compensation policy to cancel the venue, otherwise ask the customer while showing the actual partial outcome.
After a timeout, inspect supplier history and payment evidence before retrying a purchase.
An application action ID and provider idempotency key reduce duplicate execution, but browser retries still need supplier reconciliation.
Cancellation arriving during execution must leave the action unresolved until supplier evidence establishes whether it committed.

| Record | Minimum proposed evidence |
| --- | --- |
| Customer payment | Checkout Session and PaymentIntent IDs, verified status, amount, currency, mode, and event-plan reference. |
| Venue reservation | Supplier booking ID, accepted date and time, venue, price, cancellation terms, and supplier confirmation page or receipt. |
| Item purchase | Supplier order ID, item and quantity, final total, fulfillment method, and supplier confirmation. |
| Supplier payment | Card-provider authorization and capture references where available, or a provider statement reconciled to the supplier receipt. |
| Supplier cancellation | Supplier cancellation reference or final account status, timestamp, retained fees, and refund destination. |
| Supplier money recovery | Reversal evidence or refund transaction and amount, matched to the supplier commitment. |
| Customer refund | Refund ID, amount, current Stripe status, and failure or pending reason where present. |

Keep raw payment credentials out of evidence and distinguish live records from simulated records throughout.
Neither an agent narrative, a locally logged spend, nor a successful click is sufficient confirmation.
The demo can truthfully finish with both supplier cancellations confirmed and refunds still pending.
It cannot claim the customer received money without evidence for that state.

## Unresolved decisions and team handoff

- The account owner must confirm live Stripe collection access, accepted business model, country, currency, merchant responsibility, supplier-card ownership, funding, and who absorbs processor costs.
- The transaction owner must choose an existing funded card or already-enabled Issuing program, and set the refund reserve and partial-failure compensation policy.
- The supplier-selection owner must identify actual venue availability and item stock, total prices, supplier fees, cancellation deadlines, loss limits, and cash refund eligibility rather than store credit.
- The agent-workflow owner must verify authorized supplier access, secure checkout entry, login grants, authentication challenges, cancellation actions, and readable confirmation evidence for each selected supplier.
- The frontend and transaction owners must agree how approval revocation, partial success, pending cancellation, and pending refunds appear in the shared event summary.
- The demo owner must define the last point at which missing prerequisites trigger the labeled simulation fallback and avoid claiming a simulated transaction as revenue or a real purchase.

The narrow path is technically plausible, but live feasibility remains blocked on these supplier and account facts.
Naive cards and wallet are not supported live dependencies based on the current detailed documentation.
Connect becomes attractive only with participating suppliers, while Issuing helps only after account access and funding are established.
