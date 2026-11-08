# ARRANGE: an event-planning company that runs itself

Type: spec
Status: open
Label: ready-for-agent
Owner: unassigned

## Problem Statement

A customer who wants to host an event (a team dinner, an offsite, a party) has to find a venue and suppliers, ask each one for prices and terms, chase the replies, compare the results, pay, and then make sure everyone has confirmed.
That takes days of back-and-forth email, and the customer has to manage all of it.

The previous We Gotchu app tried to solve this, but its workflow was driven by scripted code, customer polling and hand-built checkpoints.
Supplier emails were never actually sent or read, and a bookable plan only appeared in simulated mode.
The company could not run without a developer pushing it along.

## Solution

ARRANGE is an event-planning company operated by one Naive agent per event.
The customer writes a short brief with a budget.
ARRANGE researches real venues and supplies, shows a few sourced options, and lets the customer pick one.
It then emails the chosen suppliers, asks for the missing terms (price per head, deposit, cancellation), negotiates where needed, and assembles a complete event plan whose every line is backed by a supplier email.
The customer reviews and explicitly approves the plan, then pays through Stripe Checkout.
After payment, ARRANGE asks the suppliers to confirm and shows the customer each confirmation as it arrives.

The customer only does three things: send the brief, choose an option, and approve and pay.
No developer or operator advances the workflow.
Only customer actions, supplier emails and Stripe payment events move it forward.

The product reads as a real service: warm, human copy and no demo, test or simulated labels anywhere the customer looks.
Every status states exactly what happened ("Cafe Botanico confirmed by email", "Payment received") and never claims a reservation in a supplier's own system.
What is simulated for the hackathon (controlled supplier inboxes, Stripe sandbox) is disclosed in the README and the pitch, not in the product.

## Current implementation scope

The complete customer flow now has a local implementation under `/arrange`.
It includes options, customer choice, supplier terms, versioned offers, explicit approval, sandbox payment handling and supplier confirmations.
Run `bun run arrange:verify` for the repeatable full HTTP check with fake providers and signed fixture webhooks.
See `docs/arrange/local-workflow.md` for the implementation decisions, exact local commands and remaining live-provider checks.
The original first-slice document records the earlier scope.
No deployment or remote retirement is part of this local implementation.

## User Stories

1.
  As a customer, I want to describe my event in one sentence-style form (what, how many people, where, when, budget), so that I can start without a long questionnaire.
2.
  As a customer, I want to sign in, so that my events and payments are private to me.
3.
  As a customer, I want to see that ARRANGE has started working right after I submit my brief, so that I know my request was received.
4.
  As a customer, I want short, human updates while research is happening, so that I understand what is being done for me.
5.
  As a customer, I want to see about three venue options with photos, a short reason each fits, and the source of each fact, so that I can trust the recommendations.
6.
  As a customer, I want each option to say clearly which terms are already known and which still need to be confirmed with the supplier, so that I'm not misled by guesses.
7.
  As a customer, I want to pick one option with a single click, so that choosing is easy.
8.
  As a customer, I want to be told that ARRANGE is now contacting the venue and suppliers, so that I know what happens next.
9.
  As a customer, I want to see when each supplier has replied, so that I can follow the progress without reading emails myself.
10.
  As a customer, I want ARRANGE to negotiate on my behalf when a price is above my budget, so that I get a better deal without effort.
11.
  As a customer, I want to receive one complete event plan with itemised lines, a total, deposit and cancellation terms, so that I know exactly what I'm paying for.
12.
  As a customer, I want the total to be within my budget, or to be told plainly how much it is over and why, so that I'm never surprised.
13.
  As a customer, I want to pay the event plan's total through a familiar, secure checkout, so that payment feels safe.
14.
  As a customer, I want the amount I pay to match the event plan I reviewed exactly, so that I'm never charged something different.
15.
  As a customer, I want to see "Payment received" only after the payment has actually gone through, so that the status is trustworthy.
16.
  As a customer, I want to see each supplier's confirmation after payment, with the date and time they confirmed, so that I know my event is on.
17.
  As a customer, I want a clear "everything is confirmed" moment, so that I can stop worrying.
18.
  As a customer, I want an email when my event plan is ready and when everything is confirmed, so that I don't have to keep the page open.
19.
  As a customer, I want to come back later and see the latest state of my event, so that I can check progress at any time.
20.
  As a customer, I want friendly error messages instead of technical ones, so that I know what to do if something goes wrong.
21.
  As a customer, I never want to see another customer's events, plans or payments.
22.
  As a supplier, I want to receive a clear, polite email that states the event date, guest count and exactly what information is needed, so that I can reply quickly.
23.
  As a supplier, I want to reply naturally by email in the same thread, so that I don't have to use a new system.
24.
  As a supplier, I want follow-up questions and counter-offers to arrive in the same thread, so that the conversation stays in one place.
25.
  As a supplier, I want a clear confirmation request after the customer has paid, so that I know the event is going ahead.
26.
  As the ARRANGE agent, I want to read the event's brief, chosen option, supplier threads and payment state through one tool, so that I always act on the current facts.
27.
  As the ARRANGE agent, I want to publish researched options as structured records, so that the customer sees them in the product.
28.
  As the ARRANGE agent, I want to email a supplier through a tool that only allows approved supplier addresses, so that I can't send email to the wrong people.
29.
  As the ARRANGE agent, I want each supplier reply delivered into my existing session for that event, so that I keep the full context of the negotiation.
30.
  As the ARRANGE agent, I want to record a supplier's terms or confirmation and cite the email it came from, so that every claim is backed by evidence.
31.
  As the ARRANGE agent, I want to propose an event plan and be told exactly what is missing if it is rejected, so that I can fix it by asking the supplier.
32.
  As the ARRANGE agent, I want to post warm customer updates, so that the customer feels looked after.
33.
  As the ARRANGE agent, I want to be told when the customer has chosen and when the payment has gone through, so that I know when to continue.
34.
  As the company owner, I want the whole company (agent, prompts, tools, budgets) declared in config and applied with one command, so that it can be rebuilt from scratch.
35.
  As the company owner, I want agent spending capped per event and per month, so that a runaway agent can't drain the credit.
36.
  As the company owner, I want the old hand-made Naive agents and the stale webhook retired through config, so that the org only contains what ARRANGE uses.
37.
  As the company owner, I want live Stripe keys to be refused, so that no real charge can happen by mistake.
38.
  As the company owner, I want duplicate Stripe or AgentMail webhook deliveries to have no extra effect, so that retries never double-count a payment or reply.
39.
  As the company owner, I want the whole happy path to complete with zero operator actions, so that ARRANGE really runs itself.
40.
  As a demo viewer, I want to see the agent's activity as the event progresses, so that I can see the company working on its own.

## Implementation Decisions

- **One agent, one session per event.** The agent `arrange-lead` is declared in `naive.config.ts` and applied with `naive up`.
  Each event gets one durable Naive session, created when the brief is submitted with `Idempotency-Key = event:{eventId}`, and its id is stored on the event.
  The session transcript is the agent's memory of the event.
  There is no planner team, no custom memory, no checkpoints, no polling stage machine and no scripted agent.
- **The Event ledger is the one deep module.
  It stores facts and enforces rules; it never decides.** All writes to an event go through it: from the agent's MCP tools, the customer routes, the Stripe webhook and the AgentMail webhook.
  Its interface is a small set of business operations: create event, publish options, record customer choice, authorize a supplier email and record its outcome, record an inbound supplier email and its delivery to the session, record supplier terms or confirmation, propose event plan, approve offer, authorize checkout, record payment, post update, read event view.
  The agent decides whom to contact, what to ask and what to do next; the ledger only answers "is this allowed?" and "what has happened?".
  Callers authenticate, parse input and call it; they hold no business rules.
- **Facts, not a status chain.** The ledger stores independent facts (options published, choice made, messages sent and received, terms recorded, offer proposed, offer approved, payment received, supplier confirmations, updates).
  The customer-facing stage is derived from those facts each time the event is read.
  Supplier threads and research can overlap, and a single status field can't represent that.
- **Deterministic rules owned by the Event ledger:**
  - Money is stored in minor units.
  The event plan total is computed by the server as the sum of its lines; the agent never supplies a total or a payment amount.
  - An event plan is accepted only if every line has a price, a currency, cancellation terms and a supplier email as evidence, and the total is within budget or the overage is stated for the customer.
  - **Explicit customer offer approval:** the customer approves one specific offer version, and the approval is stored as a versioned fact.
  Checkout is only possible for an approved version, and the Checkout amount comes from that stored offer.
  - The event is marked paid only by a verified, deduplicated Stripe webhook (deduplicated on the Stripe event id).
  Live Stripe keys are refused.
  - **Payment and fulfilment are separate facts.** "Payment received" and "Cafe Botanico confirmed" are different facts, and one never implies the other.
  Fulfilment is recorded per supplier: a confirmation request sent, then a confirmation received with the supplier's email as evidence.
  Supplier confirmations are accepted only after payment.
  - **Supplier-send authorization:** before any supplier email is sent, the ledger authorizes and records it.
  The recipient must be a supplier contact on this event, the customer must have allowed supplier contact, the per-event send cap must not be reached, and the operation key must be new (a repeat with the same draft returns the original operation; a different draft is refused).
  No human approves each email; the rules and the recorded authorization replace that.
  - Recorded supplier terms must quote an excerpt that appears in the stored supplier email.
  - A customer can read and act only on their own events.
- **Provider calls happen outside DB transactions, with durable operation ids.** For every provider side effect (AgentMail send, Stripe Checkout, Naive session create and send) the ledger first writes an operation row in a transaction, the app calls the provider with that operation id as its idempotency key, and the outcome is recorded in a second transaction.
  An `unknown` outcome is reconciled by reading the provider's record, never re-sent blindly.
- **MCP tools on our app.** Naive reaches the endpoint through an `mcp_servers` entry with a vault `static_bearer` credential.
  The full product uses six tools: `get_event`, `publish_options`, `email_supplier`, `record_supplier_reply` (kind: terms or confirmation), `propose_offer` (the event plan), `post_update`.
  Naive's custom tools are not available yet, so MCP is the native route.
  The tools are set to `allow`: safety comes from the Event ledger's rules, the AgentMail allowlist and the Naive budget, not from per-call human approval.
- **Built-in research tools:** the agent uses Naive's `web_search` and `web_fetch`.
  There is no custom discovery integration.
- **Supplier email through AgentMail (Free plan):** three inboxes (ARRANGE, one venue, one supplier).
  The agent sends through the email tool, which the ledger authorizes before AgentMail is called.
  An AgentMail webhook verifies the Svix signature, stores the receipt once per message, matches the reply to our sent message by thread headers, records it with the Event ledger and delivers the reply text into the event's Naive session with `sessions.send(queue: true)` and `Idempotency-Key = inbound:{messageId}`.
  If the Naive call fails, the webhook returns 5xx and AgentMail retries with the same key.
  During the demo, teammates reply live from the two supplier inboxes, acting only as suppliers.
- **Payment through Stripe sandbox Checkout:** the existing Checkout creation, sandbox guard and signed webhook are reused.
  Checkout is authorized with key `checkout:{approvalId}` before Stripe is called.
  After the webhook records the payment, the app tells the event's Naive session that payment has gone through.
- **Customer actions reach the agent as session messages:** submitting the brief creates the session; choosing an option and payment each send one message into it.
  Nothing else wakes the agent.
- **Customer interface:** the existing hostwell UI kit, theme, brief form, venue cards, receipt and "We're on it!" screens are reused and read the event view from the Event ledger.
  All demo, simulated and test wording, `sim_` references and robotic copy are removed.
  Customer emails reuse the existing AgentMail templates.
- **Records:** events (with brief, consent and session id), supplier contacts, mail operations (outbound), mail receipts (inbound), supplier terms and confirmations, offers and offer lines, offer approvals, payments, updates and processed webhook events.
  The schema keeps the existing transaction tables' good parts (unique Stripe event, unique payment per plan) and drops runs, checkpoints, leases and correction counters.
  An internal mode field on records stays, never shown to customers.
- **Removed from the old code, once each replacement is verified live:** the legacy research pipeline, the raw REST Naive client, the polling stage machine, checkpoints and recovery, leases, the correction budget, the cleanup reconciler, approval hashing, the 429 retry wrapper, the planner team, the scripted agent, the simulated supplier adapter, the custom JSON-RPC MCP server (replaced by the new tools), the Monid discovery, and the team-process tooling and docs.
  Nothing is deleted before its replacement works.
- **Hosting:** Vercel with TanStack Start, Clerk and Neon, as today.
- **Org cleanup:** the old hand-made Naive agents and the stale tunnel webhook are listed under `removed` in `naive.config.ts`, after a dry run.

## Testing Decisions

- Keep tests minimal, and only for rules where a mistake would cost money, break trust or leak data.
  A good test drives the Event ledger through its interface and asserts on the resulting event view, never on internal helpers or table rows.
- Test seam: the Event ledger's interface, running against PGlite, with in-memory stand-ins for Stripe, AgentMail and the Naive client.
- Tests to write:
  1.
  An event plan with a missing price, missing cancellation terms or missing supplier evidence is rejected with a reason; a complete one is accepted and its total equals the sum of its lines.
  2.
  Checkout is refused without an approval of the current offer version, and the Checkout amount equals the approved offer total.
  3.
  Only a verified Stripe payment event marks the event paid; delivering the same event twice has no extra effect.
  4.
  A supplier confirmation before payment is rejected.
  5.
  A supplier send is refused without consent, to a contact not on the event, past the cap, and on a reused key with a different draft; a repeat with the same key and draft returns the original operation; an `unknown` send outcome is reconciled, never re-sent.
  6.
  A duplicate AgentMail webhook stores one receipt and delivers to the session with the same idempotency key.
  7.
  Terms whose excerpt isn't in the supplier email are refused.
  8.
  One customer cannot read or act on another customer's event.
- No unit tests for the MCP tool wrappers, the webhook routes, UI copy or agent behaviour.
- **Local-first verification.** Each slice first passes a local integration gate: tests drive the running app through its real routes (`/api` MCP endpoint, a correctly signed AgentMail webhook payload, the Stripe webhook, the customer event view) with fake AgentMail, Stripe and Naive adapters and a scripted fake agent turn.
  Only after that, and with the user's approval, comes a live check (a temporary tunnel, real AgentMail inboxes and webhook, `naive up`, a real Naive session and a teammate's real reply with the customer's tab closed).
  Deployment is considered only after the live run has been demonstrated and reviewed.
  The final check is one live run-through of the full happy path with zero operator actions.
- Prior art: the existing PGlite-backed store tests and the Stripe webhook dedupe tests in the current repo.

## Out of Scope

- Real supplier bookings or reservations in supplier systems, and payments to suppliers.
- Event cancellation and refunds after payment.
- Multi-agent teams, scheduled follow-ups and board tasks (a "nudge suppliers who haven't replied" schedule is the first addition if needed).
- Naive-hosted apps, Naive store payments, and Naive identity email for suppliers.
- Live Stripe keys, a custom email domain and more than one venue and one supplier per event.
- Service fees (the first version charges none).
- Changing the brief after research has started.

## Further Notes

- Unverified until tested live: whether `z-ai/glm-5.3-flash` is good enough at tool use and negotiation (a stronger model is a one-line config change); whether Naive reaches our MCP endpoint over streamable HTTP; how often Naive returns capacity errors (seen during setup); whether AgentMail deduplicates sends by idempotency key (we keep our own sent record either way).
- AgentMail Free adds a footer to every email and limits new recipients in the first hour, so the supplier inboxes should be warmed up before the demo.
- Stripe shows its own "TEST MODE" badge on sandbox Checkout; it cannot be removed without live keys.
- "Event ledger" is a new term; add it to the glossary when implementation starts.
- Full architecture, reuse and deletion decisions, and provider research are recorded in the workstream's shared folder.
