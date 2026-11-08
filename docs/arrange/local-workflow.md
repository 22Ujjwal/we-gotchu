# ARRANGE local workflow

The complete customer flow is implemented under `/arrange`.
The old application remains available because its replacement has not been verified with live providers.
Nothing in this local workflow deploys, provisions accounts, sends real mail, or charges a card.

## Run it

From `/Users/minhthiennguyen/Desktop/we-gotchu`, run:

```sh
bun run arrange:local
```

Open `http://127.0.0.1:3100/arrange`.
This uses a local customer identity, PGlite, and fake Naive, AgentMail, Checkout and customer-email adapters.
The fake agent does not research or make decisions by itself.
Use the acceptance command below to drive a complete fixture event through the same application routes.
A normal form submission waits for agent tools to publish options.

The command uses the existing `~/.local/bin/agent-process` launcher, binds only to loopback, and has a one-hour deadline.
Press Ctrl+C to stop it.
Use `ARRANGE_LOCAL_PORT=3101 bun run arrange:local` if port 3100 is occupied.
Do not kill another process to free a port.
Local event records persist in `.scratch/local-arrange-db`.

To run the complete acceptance flow:

```sh
bun run arrange:verify
```

This starts its own server and fresh local database, runs the HTTP checks, saves `.scratch/arrange-local-evidence.json`, and stops its server.
It refuses a server that does not identify itself as a direct localhost fake-provider instance before creating an event.
The evidence contains fixture event data, not credentials.
The command does not prove autonomous model behavior or real provider delivery.

## What the complete check does

1. It checks that MCP rejects a missing bearer and that public forwarding cannot use the local customer identity.
2. It creates an event and a persistent fake session.
3. It publishes a sourced option containing a venue and a supplies vendor, then records the customer's choice.
4. It requests and receives quotes through the email adapter and signed AgentMail webhook route.
5. It records price, deposit and cancellation excerpts, then proposes a complete offer with a server-computed total.
6. It rejects checkout before approval, approves the exact offer version, and creates one idempotent checkout.
7. It rejects an unsigned payment, accepts a correctly signed local Stripe event, and deduplicates redelivery.
8. It resumes the same event session and sends confirmation requests linked to the recorded payment.
9. It processes both supplier confirmations and completes the event only after both have replied.
10. It verifies the customer view and records both customer notifications through the fake sender.

The supplier replies and agent tool calls in this command are scripted fixtures.
Signature verification, routes, ledger rules, transactions, migrations, derived customer state and page rendering are real application code.
HTTP rendering is not an interactive browser check.
Component tests cover the approval and payment controls, including explicit consent for a budget overage.

## Business rules

The agent decides what to research, what to write, whether to negotiate and when an offer is complete.
The application does not recreate that decision process.
`naive.config.ts` grants the native research tools and the application tools for options, supplier emails, terms, offers, confirmations and updates.

Every option includes a source link, supplier contact IDs, known facts and unresolved terms.
The controlled supplier contacts come from configuration.
The agent cannot introduce an arbitrary recipient through an option.
Once options exist, outreach waits for the customer's choice and is limited to the chosen contacts.

Offer lines reference recorded price, deposit and cancellation terms from the same selected supplier.
The server calculates totals in minor units.
A replacement offer invalidates the earlier approval.
Once checkout starts, the offer is locked so a paid amount cannot refer to a different version.
An over-budget offer requires explicit customer acceptance of the overage.

Checkout uses a durable operation ID and a stable expiration time.
A retry uses the same provider idempotency key and the same parameters.
An expired checkout is refused rather than creating another payment opportunity with an uncertain prior outcome.
Refunds and post-payment cancellation remain outside this product scope.

Only a verified sandbox Stripe webhook records payment.
Provider event IDs are globally unique in `arrange_payment_events`.
A receipt cannot be applied to another event or to different payment details.
Payment delivery to Naive uses a durable message key, so a webhook retry can repair delivery without recording payment twice.

Payment and fulfillment are separate facts.
A confirmation must cite a supplier reply to an outgoing request linked to that exact recorded payment.
Matching timestamps alone do not satisfy this rule.
An email confirmation does not claim a reservation in an external booking system.

Customer-email intents are recorded before sending.
The live sender resolves the customer's verified primary Clerk address.
An uncertain email result remains unknown and is not blindly sent again.
Local fake notifications record completion without contacting an inbox.

## Storage choice

The existing six email and event tables remain in use.
`arrange_commerce` stores each event's independent option, choice, offer, approval, checkout, payment, confirmation and delivery facts in one typed JSON document.
Writes lock the parent event row before reading and changing those facts.
This keeps approval and payment checks atomic without spreading their rules across routes.
Immutable offer versions remain in the document.
There is no stored linear workflow status.

This differs from normalizing every offer and approval into its own table in the earlier proposal.
The benefit is a smaller implementation with one transaction rule, matching the repository's existing use of JSON records.
The cost is rewriting the event document and less convenient cross-event reporting.
Relational offer tables would be preferable if that reporting or much larger event histories becomes a requirement.
The payment receipt table is separate because global uniqueness must hold across event documents.

## Before a real-provider run

The local scripts do not read `.env.arrange-live` and do not apply `naive up`.
The inherited live environment file is incomplete and must be rebuilt through the setup script rather than sourced as-is.
The setup writer now preserves successive values and keeps the file private.
Teardown requires a recorded webhook ID and a matching URL; it cannot disable unrelated webhooks by path matching.

The earlier AgentMail credential was refused for `inbox_create` with HTTP 403.
Organization-scoped access is still required to create the controlled inboxes and webhook.
For a venue-plus-supplies live run, configure the additional controlled supplies inbox in `ARRANGE_SUPPLIER_EMAIL`.
Run the inbox setup phase with `--with-supplies` to include the third controlled inbox.
Without that flag it keeps the earlier two-inbox scope.
Customer notifications also need permission to send to the verified customer address.
Do not broaden an account-wide allowlist without inspecting its existing users and entries.

The Naive dry run attempted during this work failed while listing `/v1/vaults` with HTTP 500.
No configuration was applied.
A successful dry run and review of its exact changes are still needed before connecting the isolated event lead.
Keep the earlier agents and unrelated webhooks unchanged.

A live test still needs a temporary approved HTTPS tunnel, a bearer-protected MCP endpoint, a signed AgentMail webhook, and a teammate's supplier replies.
Set `ARRANGE_TUNNEL_HOST` to the one exact tunnel hostname; wildcard tunnel hosts are not enabled.
The fixed local identity is unavailable outside fake-provider development mode and rejects forwarded requests.
Use real Clerk sign-in for customer actions in a real-provider run.

Real research quality, real Clerk sign-in, real supplier email delivery, actual sandbox Checkout, long-idle session resumption and provider queue behavior remain unverified.
Do not delete the legacy research, payment or supplier paths or retire remote agents until their replacements pass the approved live checks.
Deployment remains outside this task.
