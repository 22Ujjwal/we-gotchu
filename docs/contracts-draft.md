# Shared contract draft

Version: 0.4 draft (hackathon cut, aligned with the merged [agent research spec](../.scratch/specs/agent-research.md) and its [six tickets](../.scratch/agent-research/issues)).
Status: contract 0.4 schemas and backend core are merged through PRs #16 and #20. Incompatible changes still require review by affected consumers; hosted integration remains unverified.
The research spec and the [readiness report](research/agent-research-readiness.md) are merged and are the source for the research fields below.
The report records a live Naive research experiment; supplier execution, booking, payment, and cancellation have not been run.
The schemas are implemented in the merged foundation PR; this document is the prose reference and the code is the check.
The transaction owner maintains the shared schemas and fixtures in src/contracts.
All consumers import the schemas from src/contracts rather than keeping separate copies.
Ujjwal maintains them following the [foundation task](team/foundation.md).
See [ownership](team/ownership.md) for changes, [architecture](architecture-draft.md) for system boundaries, and the [demo plan](team/demo-plan.md) for build order.

## Why 0.3

Hacking stops at 11:00 AM on November 8, 2026, so 0.2 was too large to build and integrate in time.
0.3 keeps two guarantees and cuts everything a single-event demo does not need.

- Approval before purchase: no supplier commitment runs unless a stored, unexpired, unrevoked approval for the current plan revision includes that action and its payment is confirmed.
- No double purchase: each supplier commitment and each cancellation has one server-derived execution key with a database uniqueness constraint, so a repeated call returns the existing attempt instead of running again.

## Changes from 0.3

| Change | Effect |
| --- | --- |
| Research uses Tony's tested path: a Naive session with `web_search` and a required `submit_output`, not an MCP tool. The `submit_plan` MCP tool is removed. | Research no longer depends on the unverified Naive-to-MCP connection. MCP is used for execution and cancellation only. Source: Tony's merged readiness report. |
| The backend runs Tony's `advanceResearch(event)` when the event page polls and when a run starts; it reads the session result, validates it, and stores the Plan. | No worker is needed. Tony's sequence tracking is kept in a new Run record. |
| A ResearchResult is separate from a Plan. A ResearchResult is read-only evidence from one Run; the backend derives a bookable Plan from it only when the result supports one. | Matches the glossary distinction between research, an Event plan, and an approval. A result that is partial, over budget, or unknown never reaches approval. |
| Candidate carries sources (url, tool, stage, retrieval time), evidence mode, price provenance, taxes and delivery status, per-requirement verification, and affiliate disclosure. The result carries ranked recommendations (matched, unmet, unchecked), source checks with reasons for unknowns, missing fields, warnings, and a superseded flag. | The evidence fields the research spec and tickets 01 to 03 require. Tony supplies them. |
| New Run record; Event.naiveSessionIds is removed. | Stores the Naive session id, idempotency key, last processed Naive sequence, a single-flight lease, and a one-correction counter. |
| POST /api/events validates the brief and returns 422 with the missing field names before any paid search. | Covers Tony's "missing essential requirements before searching". |
| New PATCH /api/events/:id/brief. | Restores brief revision for ticket 04. It is the single path for answering missing fields and for changing requirements. |
| A Plan exists only for a result whose budget fit is `within` and whose selected candidates have known prices and cancellation terms. POST approve also refuses unknown cancellation terms. | Applies the research spec's rule that unknown required costs prevent a within-budget claim. |
| Cancel while researching cancels the Naive session. | Matches the research spec; Tony's report shows session cancel working. |
| briefRevision and contractVersion on every result and plan, plus a conditional write so a result is stored only for the current briefRevision. | Ticket 04 requires the stale-write rule at the storage boundary; the backend owns it, and Tony carries run and brief identities through the result. |
| Tickets 04 and 06 are no longer deferred. | 0.4 wrongly deferred them. They stay in Tony's agreed batch; sequencing is for Tony and Ujjwal to agree. |
| Execution, supplier cancellation, and the simulated supplier adapter are not part of Tony's six research tickets. | Tony has not accepted them. Ownership is to be agreed; see the Supplier adapter section. |
| New `needs_input` and `researched` event statuses and an `awaiting_input` Run state. | `needs_input` carries Tony's awaiting-input outcome with the missing field names. `researched` means a ResearchResult exists but no bookable Plan could be derived. Additive. |

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
| ResearchResult | contractVersion, eventId, briefRevision, runId, outcome (`success`, `partial`, `awaiting_input`, `failed`, `canceled`), missing, candidates, recommendations (candidateId, rank, matched, unmet, unchecked), budgetFit (`within`, `over`, or `unknown`), budgetBasis, currency, warnings, sourceChecks (url, tool, outcome, missingFields, reason), superseded, createdAt. Read-only; cannot be approved. |
| Plan | planId, eventId, contractVersion, briefRevision, revision, runId, selectedCandidateIds, actions, total, currency, serviceFee of zero, cancellationTerms, agentReasoning, mode, budgetFit (always `within`), budgetBasis, warnings. Derived by the backend from a ResearchResult. |
| Candidate | candidateId, name, kind (`venue` or `supply`; a category page is a discovery lead, never a candidate), supplierId when known, sources (url, tool, stage `discovery`, `detail`, or `quote`, retrievedAt), observedAt, evidenceMode (`live` or `simulated`), priceEstimate (total for the required quantity, or null when unknown), priceProvenance (`quote`, `supplier_listing`, or `estimate`), taxesAndDelivery (`included`, `excluded`, or `unknown`), quantityInfo, cancellationTerms, verification (per requirement: `known`, `unknown`, or `conflict`, each with a source), affiliateDisclosure, whyChosenOrRejected. |
| Run | runId, eventId, phase (`research`, `execute`, or `cancel`), briefRevision, idempotencyKey (unique), naiveSessionId, lastSequence, state (`running`, `awaiting_input`, `succeeded`, `partial`, `failed`, `canceled`, or `unknown`), advancingUntil, correctionsUsed (0 or 1), createdAt. |
| PlannedAction | actionId, kind (`venue_booking` or `item_purchase`), supplierName, target, quantityOrSchedule, maximumAmount, cancellationTerms, sourceUrl, dependsOn, mode. |
| Approval | approvalId, eventId, planId, planRevision, actionIds, approvedTotal, currency, approvedAt, expiresAt, revokedAt. |
| Payment | paymentId, approvalId, checkoutSessionId, paymentIntentId, amount, currency, state, refundId, refundState, refundReason, mode. |
| Attempt | attemptId, eventId, actionId, approvalId, kind (`commit` or `cancel`), executionKey (unique), state, providerReference, actualAmount, evidence, errorReason, mode, updatedAt. |
| ProgressEntry | eventId, sequence, actor (`agent`, `customer`, or `system`), message, createdAt. |

Event status values: `researching`, `needs_input`, `researched`, `plan_ready`, `awaiting_payment`, `executing`, `booked`, `partially_booked`, `canceling`, `canceled`, `failed`.
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
| PATCH /api/events/:id/brief | expectedBriefRevision, changed or newly supplied brief fields | New briefRevision with all earlier answers retained, the previous ResearchResult marked superseded, any unapproved Plan dropped, a running research session canceled, and a new research Run (key `eventId:research:newRevision`). 409 if expectedBriefRevision is stale, or 409 `invalid_status` once cancellation was requested. |
| GET /api/events/:id?afterSequence=N | None | Event, current Run, ResearchResult, Plan, approval, payment, attempts, and progress entries after N. |
| POST /api/events/:id/approve | planId, planRevision | Approval and a Stripe Checkout URL; a repeat for the same revision returns the same URL while unexpired. 409 `invalid_status` if cancellation wins before approval persistence; the unused Checkout session is expired on a best-effort basis. 422 `budget_not_verified` if budgetFit is not `within` or an action's cancellation terms are unknown. |
| POST /api/events/:id/cancel | None | Event in `canceling`; the backend cancels a running research session, revokes unstarted work, expires any open Checkout session, and starts the cancellation session when commitments exist. |

Errors return HTTP 401, 403, 404, 409 for a stale plan revision, or 422 for invalid input, with `errorCode` and a readable `message`.

Provider endpoints, not customer routes:

- POST /api/stripe/webhook verifies the Stripe signature and stores each Stripe event id once.
- POST /api/mcp accepts only the static bearer from Naive's vault.

Deferred: a separate plan route (the Plan is derived automatically), choosing among alternative plans, cancellation quotes, plan revision by chat, Idempotency-Key headers.
If the customer wants a different venue after a Plan exists, they change the brief, which starts new research.

## Approval and payment

POST /api/events/:id/approve creates the Approval and the Checkout session in one request.
Both expire at the same instant, proposed as 31 minutes after creation so the Stripe minimum is met with a margin.
The approval stores exactly the plan revision, action ids, and total shown to the customer.
The Checkout amount equals the approved total with a zero service fee.

The approval transaction locks the event and checks the current plan revision and cancellation flag before storing approval and payment together.
If cancellation was recorded first, approval fails with 409 `invalid_status`; the backend requests expiry of the unused Checkout session and saves neither record. Session expiry is best effort if Stripe is unavailable.

The `checkout.session.completed` webhook records a verified Payment as `paid` when its session identity, amount, currency, approval metadata, plan revision, and provider payment state match, including when the approval has since been revoked.
Only a current, unexpired, unrevoked approval on an eligible event can start new execution.
If payment arrives after revocation or expiry with no supplier commitments, the backend requests a full refund with reason `late_or_revoked` and starts no supplier work. Existing commitments require cancellation settlement before the final refund.
Because canceling expires any open Checkout session, this case should be rare.
Webhook redelivery resumes an interrupted execution or refund handoff; a paid row alone is not evidence that the handoff finished. A durable completion receipt and stable execution and refund identities prevent a completed delivery from starting fresh work.
The Checkout success URL only shows a waiting screen; it never marks payment.

## Research

Tony owns research orchestration, the validator, and the ResearchResult content; the backend owns storage, the stale-revision check, and Plan derivation.
Research is read-only: it makes no supplier contact, commitment, or payment, and a ResearchResult is not an Event plan or an approval.
The research session is created with `web_search` and a required `submit_output`, matching the configuration Tony tested.
Naive keeps session output, so the backend can read it by polling; a webhook is not needed to start testing.

**Starting.**
POST /api/events validates the brief, creates the Event and a research Run with a stable idempotency key, and calls Tony's `startResearch`.
An uncertain session-creation outcome is recorded on the Run and reconciled with the same key before another session is created.

**Advancing.**
The backend calls `advanceResearch(event, run)` when the event page polls an event in `researching` or `needs_input`.
Before calling it, the backend takes a single-flight lease with one conditional update (set `advancingUntil` only if it is null or past and the run is `running`).
A poll that does not get the lease returns the stored state and does not call Naive.
`advanceResearch` reads the session by sequence, tolerates duplicate delivery, and records the last fully processed sequence on the Run.
An idle session with no valid structured output is not complete.
Tony's validator rejects unsupported conclusions, and one corrective message is allowed per run; `correctionsUsed` is set in the same update that sends it, so concurrent polls cannot send two.

**Storing.**
A ResearchResult is stored once per Run, only if the Run is still `running` and its briefRevision equals Event.briefRevision, checked in the same database statement as the write.
Outcomes map to event status: success and partial store the result; awaiting_input sets `needs_input`; failed and canceled set `failed` or `canceled`.
A result for an older brief revision is stored as superseded or discarded, never shown as current.

**Deriving a Plan.**
After storing a success or partial result, the backend derives a Plan from the top-ranked venue and supply only if budgetFit is `within` and each selected candidate has a known price and known cancellation terms.
If it can, the event becomes `plan_ready`; otherwise it becomes `researched` and the customer sees the candidates, unknowns, and warnings but cannot approve.

**Missing input.**
Essential fields missing at intake return 422 and create no event.
If the agent finds more is needed, the Run becomes `awaiting_input`, the event becomes `needs_input`, and `missing` lists the field names.
The customer answers through PATCH /api/events/:id/brief, which keeps earlier answers, increments briefRevision, and starts a new Run.

**Closing the page.**
Research continues in the Naive session whether or not the page is open.
Nothing is stored until a poll next advances the Run, so a result can wait for the next visit.
How long Naive retains session output, and whether a missed poll can hit the session's own time or budget bounds, is unverified and is recorded in the readiness check.
Cancel stops the session and marks the Run `canceled`; it does not imply any supplier transaction was canceled.

The complete integration, including polling a real session end to end, is unverified until the first live check passes.

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

Ownership of this interface, the simulated adapter, and the execution and cancellation prompts is to be agreed.
Tony has not accepted them as part of his six research tickets, so they are not assigned to him here.
Until agreed, Ujjwal writes the simulated adapter and the backend calls the interface inside execute_action, cancel_action, and reconcile_action.

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

The plan-ready fixture includes a ResearchResult and the Plan derived from it.
Tony adds research fixtures for progress, missing fields, partial results, failure, and cancellation, as his ticket 05 asks.
Tony's tickets 04 and 06 (brief revision and interrupted-session recovery) stay in his agreed batch; the demo does not depend on them.

Tests cover a refused approve for budgetFit `unknown`, a refused execute_action for no approval, an expired approval, an unpaid approval, and a repeated execute_action that returns `replayed: true`.

## Deferred after the hackathon

The following 0.2 items are deferred, not rejected: Idempotency-Key with body hashing, plan editing routes, cancellation quotes with their own expiry, `awaiting_input`, supplier recovery records, separate CancellationApproval and Refund records, supplier messages and their approval, judging late payment by provider completion time, and fixtures for every refusal.
Naive's call-scoped `ask` confirmation should be revisited before real money is used.
