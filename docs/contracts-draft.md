# Shared contract draft

Version: 0.4 draft (hackathon cut, aligned with the [agent research spec](https://github.com/22Ujjwal/we-gotchu/blob/docs/agent-research-spec/.scratch/specs/agent-research.md)).
Status: proposed, requiring review by Tony and Leo before implementation.
The research spec is on an unmerged branch and is the source for the research fields below.
The transaction owner maintains the shared schemas and fixtures in src/contracts.
All consumers import the schemas from src/contracts rather than keeping separate copies.
Ujjwal creates them as part of the [foundation task](team/foundation.md).
See [ownership](team/ownership.md) for changes, [architecture](architecture-draft.md) for system boundaries, and the [demo plan](team/demo-plan.md) for build order.

## Why 0.3

Hacking stops at 11:00 AM on November 8, 2026, so 0.2 was too large to build and integrate in time.
0.3 keeps two guarantees and cuts everything a single-event demo does not need.

- Approval before purchase: no supplier commitment runs unless a stored, unexpired, unrevoked approval for the current plan revision includes that action and its payment is confirmed.
- No double purchase: each supplier commitment and each cancellation has one server-derived execution key with a database uniqueness constraint, so a repeated call returns the existing attempt instead of running again.

## Changes from 0.3

| Change | Effect |
| --- | --- |
| Research uses Tony's tested path: a Naive session with `web_search` and a required `submit_output`, not an MCP tool. The `submit_plan` MCP tool is removed. | Research no longer depends on the unverified Naive-to-MCP connection. MCP is used for execution and cancellation only. Source: Tony's readiness report on branch research/agent-readiness. |
| The backend runs Tony's `advanceResearch(event)` when the event page polls and when a run starts; it reads the session result, validates it, and stores the Plan. | No worker is needed. Tony's sequence tracking is kept in a new Run record. |
| Candidate and Plan gain optional research fields: observation time, price provenance, per-requirement verification, budget fit, missing information, warnings, and research outcome. | Additive for Leo; Tony supplies them. |
| New Run record; Event.naiveSessionIds is removed. | Stores the Naive session id, idempotency key, and last processed Naive sequence. |
| POST /api/events validates the brief and returns 422 with the missing field names. | Covers "ask before searching" without an `awaiting_input` status. |
| POST /api/events/:id/approve refuses a plan whose budget fit is not `within` or whose action cancellation terms are unknown. | Applies the research spec's rule that unknown required costs prevent a within-budget claim. |
| Cancel while researching cancels the Naive session. | Matches the research spec; Tony's report shows session cancel working. |
| briefRevision (always 1 for the demo) and contractVersion on Plan, plus a conditional write so a Plan is stored only for the current briefRevision. | Keeps room for brief revisions after the hackathon, as Tony's ticket 04 requires at the storage boundary. |
| New `needs_input` event status and `awaiting_input` Run state. | Carries Tony's awaiting-input outcome with the missing field names; Leo shows them as a form error. Additive. |

## Changes from 0.2

| Change | Effect |
| --- | --- |
| Approval and Checkout are created in one request, both expiring at the same instant, at least 30 minutes after creation. | Fixes a defect: Stripe requires a Checkout `expires_at` 30 minutes to 24 hours after session creation, so a 30 minute approval followed by a later Checkout request could never satisfy "Checkout expires no later than approval". Source: [Stripe Checkout Session create](https://docs.stripe.com/api/checkout/sessions/create). |
| Supplier adapters run inside the backend's `execute_action` and `cancel_action` tools; the backend records the adapter result itself. | Fixes a contradiction: 0.2 said Naive's session runs the adapters, but adapter code in src/suppliers runs in our server, and a `report_result` tool would let the model report its own success. |
| The execution key is derived by the server from approvalId, actionId, and kind. | The agent cannot choose a fresh key and so cannot bypass the uniqueness constraint. The agent passes only eventId and actionId. |
| Ten routes become four customer routes, one webhook, and one MCP endpoint. | Brief editing, separate research, plan, quote, and checkout routes are deferred. |
| Seven refusal codes become two. | `not_allowed` with a reason string, and `amount_exceeded`. |
| `awaiting_input` is removed; `outcome_unknown` is renamed `unknown`. | Customer input during a supplier checkout is out of scope for the demo. |
| CancellationApproval, Refund, supplier recovery, and EventSummary become fields on Event and Payment. | Fewer records to migrate and render. |
| Idempotency-Key headers with body hashes are deferred. | Uniqueness constraints provide the guarantees that matter for the demo. |
| `mode` gains `test` for Stripe test-mode payments. | Only `live` means real money. |

## Common conventions

Identifiers are opaque strings generated by the server.
Money uses integer minor units and one ISO currency code per event; Naive usage in micro-USD is never mixed with application amounts.
Timestamps use ISO 8601 UTC; the brief keeps the event's IANA timezone.
Every external result carries `mode`: `live`, `test`, or `simulated`.
Only `live` is real money or a real supplier commitment, and the UI shows the mode next to every payment and action.
A simulated or test result cannot unlock a live supplier action.

customerId comes only from the signed-in Clerk user through the server-only requireCustomerId() in src/server/auth.ts.
Clients never send customerId.
MCP calls carry no customer identity; the backend resolves the customer from the stored event.

## Records

| Record | Fields |
| --- | --- |
| Event | eventId, customerId, brief, briefRevision, status, planRevision, cancelRequestedAt, progressSequence, createdAt. |
| Brief | eventType, location, startsAt, timezone, headcount, budget, currency, supplyNeeds, maximumCancellationLoss. |
| Plan | planId, eventId, contractVersion, briefRevision, revision, candidates, actions, total, currency, serviceFee of zero, cancellationTerms, agentReasoning, mode, researchOutcome, budgetFit (`within`, `over`, or `unknown`), budgetBasis, missing, warnings. |
| Candidate | name, kind (a specific supplier, not a category page), sourceUrl, observedAt, priceEstimate, priceProvenance (`estimate` or `quote`), quantityInfo, cancellationTerms, verification (per requirement: `known`, `unknown`, or `conflict`, each with a source), whyChosenOrRejected. |
| Run | runId, eventId, phase (`research`, `execute`, or `cancel`), briefRevision, idempotencyKey (unique), naiveSessionId, lastSequence, state (`running`, `awaiting_input`, `succeeded`, `partial`, `failed`, `canceled`, or `unknown`), createdAt. |
| PlannedAction | actionId, kind (`venue_booking` or `item_purchase`), supplierName, target, quantityOrSchedule, maximumAmount, cancellationTerms, sourceUrl, dependsOn, mode. |
| Approval | approvalId, eventId, planId, planRevision, actionIds, approvedTotal, currency, approvedAt, expiresAt, revokedAt. |
| Payment | paymentId, approvalId, checkoutSessionId, paymentIntentId, amount, currency, state, refundId, refundState, refundReason, mode. |
| Attempt | attemptId, eventId, actionId, approvalId, kind (`commit` or `cancel`), executionKey (unique), state, providerReference, actualAmount, evidence, errorReason, mode, updatedAt. |
| ProgressEntry | eventId, sequence, actor (`agent`, `customer`, or `system`), message, createdAt. |

Event status values: `researching`, `needs_input`, `plan_ready`, `awaiting_payment`, `executing`, `booked`, `partially_booked`, `canceling`, `canceled`, `failed`.
Only the backend changes status.

Payment states: `pending`, `paid`, `expired`.
Refund states: `none`, `pending`, `succeeded`, `failed`, taken from the Stripe refund object.

Evidence is a provider reference plus an optional redacted confirmation string or file reference.
A browser click, agent message, or Checkout return URL is not evidence.

## Customer API

All routes require a signed-in customer and check that the event belongs to them.

| Route | Input | Result |
| --- | --- | --- |
| POST /api/events | Brief | Event in `researching` with a research Run (idempotency key `eventId:research:briefRevision`); 422 with `missing` field names if an essential requirement is absent. |
| GET /api/events/:id?afterSequence=N | None | Event, current plan, approval, payment, attempts, and progress entries after N. |
| POST /api/events/:id/approve | planId, planRevision | Approval and a Stripe Checkout URL; a repeat for the same revision returns the same URL while unexpired. 422 `budget_not_verified` if budgetFit is not `within` or an action's cancellation terms are unknown. |
| POST /api/events/:id/cancel | None | Event in `canceling`; the backend cancels a running research session, revokes unstarted work, expires any open Checkout session, and starts the cancellation session when commitments exist. |

Errors return HTTP 401, 403, 404, 409 for a stale plan revision, or 422 for invalid input, with `errorCode` and a readable `message`.

Provider endpoints, not customer routes:

- POST /api/stripe/webhook verifies the Stripe signature and stores each Stripe event id once.
- POST /api/mcp accepts only the static bearer from Naive's vault.

Deferred: brief editing, separate research and plan routes, cancellation quotes, plan revision by chat, Idempotency-Key headers.
A customer who wants a different plan creates a new event for the demo.

## Approval and payment

POST /api/events/:id/approve creates the Approval and the Checkout session in one request.
Both expire at the same instant, proposed as 31 minutes after creation so the Stripe minimum is met with a margin.
The approval stores exactly the plan revision, action ids, and total shown to the customer.
The Checkout amount equals the approved total with a zero service fee.

The `checkout.session.completed` webhook marks the Payment `paid` only if the session's amount, currency, approvalId metadata, and plan revision match, and the approval is not revoked.
The backend then starts the execution session for that approval.
If the approval was revoked first, the payment is refunded automatically with reason `late_or_revoked` and no supplier work starts.
Because canceling expires any open Checkout session, this case should be rare.
The Checkout success URL only shows a waiting screen; it never marks payment.

## Research

Tony owns research orchestration and the ResearchResult schema; the Plan fields above are what the backend stores from it.
The research session is created with `web_search` and a required `submit_output`, matching the configuration Tony tested.
The backend calls `advanceResearch(event)` after creating the Run and whenever the event page polls an event in `researching`.
It reads the session by sequence, tolerates duplicate delivery, and treats an idle session with no valid structured output as not complete.
Tony's validator rejects unsupported conclusions, such as a within-budget claim with unknown costs, and allows one corrective message.
Outcomes map to event status as follows: success and partial store the Plan and set `plan_ready`; awaiting_input sets `needs_input` with the missing field names; failed and canceled set `failed` or `canceled`.
A Plan is stored only if the Run's briefRevision equals Event.briefRevision, checked in the same database statement as the write, so an older run cannot replace a newer result.
A partial plan whose budget fit is not `within` cannot be approved.
Research makes no supplier contact or commitment.
Whether the backend can read a finished session when polled, or needs a Naive webhook instead, is unverified and is decided with Tony.

## Guarded MCP tools

Naive calls these tools on POST /api/mcp during the execution and cancellation phases only.
Names and inputs are proposed and need Tony's review.
Every tool that changes state takes a `reason` string, which is stored as a progress entry so the demo can show what the agent decided.

| Tool | Inputs | Result |
| --- | --- | --- |
| get_event | eventId | Brief, current plan, approval and payment state, attempts, and which actions are currently allowed. |
| log_progress | eventId, message | Adds an agent progress entry; changes no other state. |
| execute_action | eventId, actionId, reason | Runs the supplier adapter's commit and returns the recorded Attempt. |
| cancel_action | eventId, actionId, reason | Runs the supplier adapter's cancel for a succeeded commitment and returns the recorded Attempt. |
| reconcile_action | eventId, actionId | Asks the adapter for the observed outcome of an `unknown` attempt without starting a new purchase. |

execute_action checks, in order, that the event is not canceling, that an approval for the current plan revision includes the action and is unexpired and unrevoked, that its payment is `paid` with a compatible mode, and that any `dependsOn` action has succeeded.
It then inserts the Attempt with executionKey `approvalId:actionId:commit`; if that key already exists it returns the existing Attempt with `replayed: true` and calls no supplier.
It passes maximumAmount to the adapter, and the adapter must refuse rather than commit above it.
cancel_action requires cancelRequestedAt and uses executionKey `approvalId:actionId:cancel`.

Refusals return `errorCode` `not_allowed` with a reason such as `no_approval`, `expired`, `revoked`, `stale_revision`, `unpaid`, `mode_mismatch`, `event_canceling`, or `dependency_pending`, or `errorCode` `amount_exceeded`.
The bearer token identifies Naive and never grants permission by itself.

When every succeeded commitment has a succeeded cancellation, the backend issues one Stripe refund for the paid amount minus any retained supplier fees, with idempotency key `paymentId:refund`.
It records the refund state Stripe returns and does not claim money arrived.

## Attempt states

States: `pending`, `running`, `succeeded`, `failed`, `unknown`, `skipped`.

| From | To | When |
| --- | --- | --- |
| (none) | running | execute_action or cancel_action passes its checks and inserts the Attempt. |
| running | succeeded | The adapter returns a provider reference. |
| running | failed | The adapter returns a definite refusal with no commitment made. |
| running | unknown | The adapter throws or times out. |
| unknown | succeeded or failed | reconcile_action returns definite evidence. |
| (none) | skipped | Cancellation was requested before the action started, recorded so the UI can show it. |

succeeded and failed are terminal, and an `unknown` attempt is never retried as a new purchase.
Updates apply only when the row is in the expected from state, so repeated calls cannot move an attempt backwards.
Canceling a booking is a separate `cancel` Attempt and leaves the original commit Attempt `succeeded`.

The progress sequence is assigned by incrementing Event.progressSequence in the same transaction that inserts the entry.

## Supplier adapter

Tony implements this interface in src/suppliers; the backend calls it inside execute_action, cancel_action, and reconcile_action.

```ts
interface SupplierAdapter {
  mode: "live" | "test" | "simulated";
  commit(action: PlannedAction, executionKey: string): Promise<AdapterResult>;
  cancel(action: PlannedAction, commitReference: string, executionKey: string): Promise<AdapterResult>;
  reconcile(action: PlannedAction, executionKey: string): Promise<AdapterResult>;
}
// AdapterResult: { outcome: "succeeded" | "failed" | "unknown"; providerReference?; actualAmount?; evidence?; errorReason? }
```

The simulated adapter returns a deterministic `sim_` reference, honors maximumAmount, and can be told to fail or time out for one rehearsal.
Each call must finish well inside one HTTP request; a supplier that needs minutes of browser work does not fit this interface and is out of scope for the demo.

## Fixtures

The transaction owner publishes three simulated fixtures, each labeled simulated:

- A plan-ready event with three candidates, one venue action, and one item action, with the research fields filled and budgetFit `within`.
- The same event booked, paid, with two succeeded attempts and progress entries.
- The same event canceled, with two cancel attempts and a pending refund.

Tony adds research fixtures for progress, missing fields, partial results, failure, and cancellation after the foundation PR, as his ticket 05 asks.
Brief revision, interrupted-session recovery, and their tests (Tony's tickets 04 and 06) are deferred until after the hackathon.

Tests cover a refused approve for budgetFit `unknown`, a refused execute_action for no approval, an expired approval, an unpaid approval, and a repeated execute_action that returns `replayed: true`.

## Deferred after the hackathon

The following 0.2 items are deferred, not rejected: Idempotency-Key with body hashing, brief revisions and plan editing routes, cancellation quotes with their own expiry, `awaiting_input`, supplier recovery records, separate CancellationApproval and Refund records, supplier messages and their approval, judging late payment by provider completion time, and fixtures for every refusal.
Naive's call-scoped `ask` confirmation should be revisited before real money is used.
