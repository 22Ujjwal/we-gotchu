# Demo integration handoff

Use branch `feat/planning-company-actions` in `22Ujjwal/we-gotchu`.
This branch contains the combined local demo work and depends on the existing planning, supplier mail and sandbox payment implementation in its history.
It is not a claim that the whole journey has passed or that the earlier stacked pull requests should be merged.

## Available flow

The homepage submits the structured brief and shows the working animation, then researched venue cards.
Choosing a setting opens its details and selectable supplies.
The customer provides an update email and clicks Please arrange this.
The application saves the request and contact permission before starting the company agent.
The company agent reads saved selections through scoped tools and prepares the supplier inquiry.
The application sends the approved inquiry through the durable mail transport.
Signed incoming replies are retained, interpreted and passed to a supplier coordination turn.
The agent can write a clarification email when quote terms are missing.
Complete saved offers have an existing review and sandbox Checkout path.

## Setup

Copy environment names from `.env.example` and supply values privately.
Follow `README.md` in this folder to create and attach the native company resources.
The company agent's MCP URL must point to the running application's `/api/planning/tools` route.
A localhost URL is not reachable by the hosted agent; local testing requires an active tunnel.
Keep the signed supplier-mail webhook pointed at that same running application.
Agent sessions retain their configured version, so an old session may retain an old tunnel URL.
Use the local reply worker documented in `tools/local-rehearsal/README.md` for recovery checks.
Never open the same local database from two processes.

The company agent reads one saved event using short-lived scoped access supplied by the application.
That MCP endpoint is not a public customer API.
The teammate-owned external endpoint should call the existing service functions with a resolved customer identity and preserve ownership checks.
Do not accept caller-provided payment amounts or treat selecting a venue as permission to contact it.
Use `createPlanning`, `getPlanning` and `commandPlanning` in `src/server/planning/service.ts` for the existing planning operations.
Use the existing event approval and Stripe webhook flow for payment.

## Verified and unfinished

Browser checks observed homepage submission, research cards, venue details, supply selection, saved arrangement creation and reload persistence.
Live controlled email checks observed customer acknowledgment delivery, supplier inquiry acceptance and an incoming reply saved with the customer browser closed.
The configured company agent read that reply, wrote a missing-terms follow-up and received an accepted send result from the application.
Provider acceptance does not establish recipient delivery.
The first reply turn required recovery after discovering that the newly created identity was not attached to the agent.
That attachment is now configured, but a fresh uninterrupted run still needs verification.

A regression reproduces and fixes rejection of replies to follow-ups that use a new provider thread.
The complete quote, customer approval, sandbox payment and final customer receipt have not passed together for this arrangement.
The final receipt email and alternate-vendor journey remain unfinished.
The first research result can contain one venue rather than three, and source photos are not yet connected to these cards.
Email wording is natural; controlled-recipient routing and sandbox execution remain configured internally.
No real supplier booking or purchase has been verified.

The pre-push full application suite reports 654 passing tests and 17 failures: 15 UI tests and two server tests.
The UI tests largely reference the previous layout and controls.
The HTTP contract and background runtime tests also need reconciliation.
These failures must be resolved before treating this branch as merge-ready.
Typecheck, the build and all 31 local tooling tests pass.
The focused planning, reply and mail-storage checks passed before that full run.
Local evidence and credentials are deliberately not included in this handoff.
