# A practical procurement proof

Research checked November 7, 2026, against public primary sources and lead checkout `d280337421028303c0e7e1eefb976566ec7cbb3f`.
No supplier was contacted, no account or credential was accessed, and no reservation, order, payment, or hosted agent request was made.
Availability, merchant acceptance of our service, and actual checkout behavior remain unverified.

## Recommendation

Use a four-hour Grove Park picnic reservation in Berkeley and one Target pickup order of 55 paper plates as the first concrete procurement candidates.
Assume an outdoor private gathering of exactly 50 people, with no ticket sales, alcohol, amplification, or purchased catering.
The customer must accept that scope; this is not a complete catered-event quote.
Prefer the ordinary supplier websites, with the customer completing checkout, before building any supplier adapter.

This proposes a narrow exception to [ADR 0002](../adr/0002-limit-hackathon-scope-and-require-action-approval.md): a human-assisted proof with direct supplier payments instead of the promised single combined customer payment.
The advantage is a real, inspectable reservation/order path with almost no new integration code; the cost is two customer checkouts and incomplete automation.
Tony would need to accept that exception before a future live proof.
If the original combined-payment and automated-cancellation demo is mandatory, keep these as research candidates and label the transaction demonstration simulated until the gates below pass.

## Concrete candidates and budget boundary

The City's [picnic rental page](https://berkeleyca.gov/city-services/event-permits-rentals/picnic-area-rentals) lists Grove Park's picnic area for 50 people and directs reservations to its recreation portal.
The park is at 1730 Oregon Street, according to the [park page](https://berkeleyca.gov/community-recreation/parks-recreation/parks/grove-park).
The May 2026 [council fee proposal, page 17](https://berkeleyca.gov/sites/default/files/2026-05/2026-05-19%20Item%2026%20Changes%20to%20Selected%20Recreation.pdf) lists Grove Area 1 at $50 resident or $60 nonresident for four hours.
That document is a proposal, not proof of adoption or today's checkout price.
No date was supplied and no reservation calendar was authenticated.

Target's [item TCIN 78774789](https://www.target.com/p/-/A-78774789) lists 55 white 8.5-inch paper plates at $2.89 before tax.
One pack supplies one plate for each attendee plus five spares; it contains no cups, napkins, or cutlery.
The [Berkeley University Avenue store](https://www.target.com/sl/berkeley-univ-ave/3267) at 1414 University Avenue offers Order Pickup.
The generic product stock label does not verify that store's stock or pickup availability on the event date.

The provisional venue-plus-plates subtotal is $62.89, calculated as $60 + $2.89.
Propose customer-approved caps of $150 all-in for the venue and $10 for supplies, leaving $840 of the $1,000 ceiling unallocated.
Any deposit counts against available cash, and insurance, taxes, processing fees, travel, food, other supplies, and weather arrangements are unresolved.

## API, email, or checkout

A supplier API would make reconciliation simpler, but [CivicPlus](https://www.civicplus.help/recreation-management/docs/view-available-api-calls) reserves POST methods for internal systems and requires organization involvement for API setup.
No public Target shopper-write API was established by the reviewed merchant docs.
Do not build against private checkout endpoints or treat research/search access as purchase access.

Email can resolve the City's policy questions, but a reply is not a reservation and timing depends on staff.
Use one approved factual inquiry when necessary; negotiation remains deferred by ADR 0002.

Website checkout has the clearest documented customer path.
Berkeley directs customers to its portal, and [Target](https://www.target.com/help/articles/orders-purchases/create-an-order) documents account sign-in, payment entry, and final submission.
A Target cart does not reserve stock.
Customer-operated checkout minimizes code but requires human work.

Target's September 2026 [terms, Agentic Commerce and Delegated Access](https://www.target.com/c/terms-conditions/-/N-4sr7l) require both customer approval and Target authorization for autonomous agents.
This research did not establish authorization for Naive or We Gotchu.
A general browser tool, customer consent, or use of an OpenAI model does not establish that authorization.
Do not substitute browser automation for a missing approved checkout integration.

## Use existing Naive capabilities first

Naive's current [email guide](https://vetta.sh/docs/identity/email.md) documents inboxes, send/read tools, and inbound handling through its native email layer.
Required setup is an identity held by the owning agent, an inbox tied to that agent, an active domain, provisioned DNS for sending, verified inbound delivery, and an authorized key for that setup.
A documented system-domain option avoids customer-managed DNS, but still needs provisioning and readiness verification.
Reuse `NAIVE_API_KEY` only with the required provisioning permissions; existing research access does not prove identity, inbox, domain, or browser grants.

[Inbound email](https://vetta.sh/docs/identity/inbound.md) can start a new session for the owning agent, rather than continue the application's saved planning session.
Correlate supplier message IDs and the inquiry reference to the conversation before showing a reply there.
Automated receipt mail can be stored without waking an agent because of loop guards; do not rely on a wake alone to capture confirmations.

The [browser guide](https://vetta.sh/docs/computer/browser.md) documents domain-scoped actions, `allow_writes`, saved-login grants, human-first login, and `allow_extract` for evidence from saved sessions.
Those are potential mechanisms for a supplier that permits automation, not tested access to either checkout here.
These require an owned computer/browser, identity and supplier grants, completed authentication, evidence extraction, and secure payment entry.
The guide does not establish arbitrary secure card injection; plan for the cardholder to handle payment and authentication challenges.
Naive's `ask_actions` applies to the agent browser tool, not REST-driven browser actions, so backend approval remains necessary.

AgentMail offers [persistent drafts](https://docs.agentmail.to/drafts), [separate draft/send permissions](https://docs.agentmail.to/permissions), and [application webhooks](https://docs.agentmail.to/webhooks-overview).
Those could matter if the product later requires an independent draft inbox and application-owned inbound delivery that the native path cannot satisfy.
For this one inquiry, native mail plus an application draft is enough on the documented capabilities; a second mailbox provider would add keys, routing, and delivery reconciliation.
Do not add AgentMail merely for sponsor coverage.
If that specific gap is demonstrated later, it needs an AgentMail account/key with restricted permissions, an inbox, and a verified webhook endpoint or explicitly chosen polling path.

## Payment and authorization gates

Stripe customer collection is not supplier payment.
A successful customer Checkout payment does not reserve the park, place a Target order, or create spendable supplier-card funds.
For the original combined-payment design, the service needs an independently funded, authorized business payment method and merchant permission to act for the customer.
[Stripe Issuing funds](https://docs.stripe.com/issuing/funding/balance) are separated from earnings and other Stripe balances; Issuing eligibility and funding are additional prerequisites.
Naive's [card documentation](https://vetta.sh/docs/identity/cards.md) still marks hosted issuing unavailable with `501 feature_not_configured`; its spend log does not move money.

Before any future live action, resolve these exact gates:

- The customer supplies the event date/time, organizer identity and residency, actual supply needs, total cap, and acceptable cancellation loss.
- The organizer has authorized recreation and Target accounts, completes any identity checks, and agrees to the actual permit terms; do not fabricate a renter identity or transfer a permit to the customer after purchase.
- The supplier quote establishes availability, fees, deposit/insurance obligations, payment methods, deadline, and refund destination.
- For the proposed manual proof, the customer authorizes and completes each supplier checkout with their own funded card; this does not require giving card data to the app.
- For combined collection, Ujjwal and the account owner verify live Stripe eligibility, webhook configuration, supplier-card ownership/funding, merchant authorization, processor-fee responsibility, and a refund reserve before collecting customer money.
- The app records plan-bound approval of the exact suppliers, date, quantity, final totals, permitted communications, and cancellation loss before commitment; any material change requires renewed approval.

Selecting a planning card is not purchase approval.
The frozen implementation keeps planning conversations separate from transaction records, so moving a selection into an approved transaction needs an explicit, owner-reviewed handoff rather than manufacturing payment actions from agent output.

## Smallest real proof and failure handling

First, with separate authorization, the customer obtains the two final review screens and resolves the City's policy questions.
Then the customer approves the exact costs and terms, reserves the venue, and places the supply order only after venue confirmation.
Retain these separate evidence records:

- Venue confirmation requires a City-issued permit or accepted reservation record with its reference, named holder, exact site/date/time, amount paid, and accepted terms; a request acknowledgement is insufficient.
- Supply order confirmation requires Target's order number, item/quantity, total, selected store, and confirmation receipt; pickup readiness and actual collection are later states.
- Supplier charge evidence and the app's customer payment evidence remain separate; neither replaces the supplier confirmation.

Berkeley's current [refund policy](https://berkeleyca.gov/community-recreation/parks-recreation/recreation-programs/recreation-program-registration) includes picnic reservations, requires seven days' notice except specified weather cases, and deducts 25% or at least $10, capped at $150.
A manager may refund, credit, prorate, transfer, or deny a request.
Its [linked general facility rules](https://berkeleyca.gov/sites/default/files/2022-02/Facility-Rental-Rules.pdf) instead say 30 days and mention insurance/deposits; the older [picnic permit](https://berkeleyca.gov/sites/default/files/2022-02/facilitypermit_picnic.pdf) says seven days and prohibits unapproved permit transfer.
Ask which terms apply to Grove before paying.
At a hypothetical $60 charge, 25% is $15, already incompatible with a customer loss limit below $10.
This venue is therefore a poor immediate-cancellation demo unless the customer accepts the confirmed loss and deadline.

Target's [cancellation help](https://help.target.com/help/subcategoryarticle?childcat=Edit+or+cancel+order&parentcat=Orders+%26+Purchases&searchQuery=search+help) makes cancellation dependent on order state and distinguishes cancellation confirmation from a temporary card hold.
Its [pickup terms](https://www.target.com/c/terms-conditions/-/N-4sr7l) provide a three-day non-grocery pickup window, with a possible extension, followed by cancellation/refund for uncollected items.
Do not sell that delayed fallback as instant cancellation.

After a timeout, mark the operation uncertain and inspect supplier history and receipts before another submission.
If the venue succeeds and supplies fail, preserve the reservation unless the customer already authorized cancellation within the actual loss limit.
If a refund is requested, retain the request separately from supplier acceptance and money received.
For combined collection, a customer [Stripe refund](https://docs.stripe.com/refunds) is another operation and can remain pending or fail; supplier recovery does not automatically refund that payment.

## Unsent inquiry draft

Recipient: recreation@berkeleyca.gov, published on the City's picnic rental page.
Subject: Grove Park picnic area for 50 people on [date], [start time] to [end time]

Hello Recreation team,

I am helping [organizer name] check options for a private gathering of 50 people at Grove Park.
We are considering [date] and a four-hour block from [start time] to [end time], including setup and cleanup.
There would be no ticket sales, alcohol, amplified sound, or bounce house.
Could you confirm availability, the correct reservation link, and the full nonresident price including any deposit or insurance requirement?
Your online refund page lists seven days' notice, while the linked general facility rules list 30 days.
Which deadline, cancellation fee, and refund method apply to this picnic reservation?
May a service assist the named organizer with the application, and must the payment card belong to that organizer?
Please do not reserve the site or charge anything in response to this inquiry.

Thank you,
[Approved sender name and role]

This draft has not been sent and does not authorize outreach or negotiation.

## Proposed implementation tickets

1. **Produce an approval-ready supplier packet.** Tony owns the narrow supplier research/evidence mapping in `src/agent` and `src/suppliers`; Leo owns the review and manual-checkout links in frontend paths.
Include exact supplier IDs, dated terms, item count, cost ceilings, open questions, and manual-versus-automated labels.
Acceptance requires no availability assertion without dated evidence and no purchase from a planning selection.

2. **Add the planning-to-transaction approval handoff.** Ujjwal owns `src/server`, `src/routes/api`, shared transaction contracts, and any migrations; Tony and Leo review the boundary before implementation.
Reuse existing approval/execution records where suitable, bind approved selection snapshots to a revision, and store receipt references and manual execution provenance without claiming agent execution.
Acceptance covers stale approval, duplicate receipts, unknown outcomes, cancellation loss limits, and separate supplier-payment/customer-payment states.

3. **Prove one permitted external action after separate authorization.** Tony owns native mail/browser configuration and the supplier adapter; Ujjwal owns the approval gate and result reconciliation; Leo owns any human takeover/status UI.
Start with the factual venue inquiry only if needed, using native email, exact recipient/body approval, and reply correlation.
Do not build Target automation without merchant authorization, or live supplier payment without a funded mechanism and approved terms.
Acceptance is supplier-issued evidence tied to the approved action, plus an explicit pending/refused outcome when the supplier cannot complete it.
