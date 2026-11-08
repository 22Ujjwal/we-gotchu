# Planning persistence and HTTP API

Planning conversations have their own IDs and database table.
They do not create transaction events, plans, approvals, or payments.
The HTTP bodies and returned views use `src/agent/planning/contract.ts`.

- `POST /api/planning` accepts `{ requestId, message }` and returns a view with status 201.
- `GET /api/planning/$id` loads the owned conversation and reads its existing hosted session once.
- `POST /api/planning/$id` accepts the shared message or selection command.

Every operation requires the existing customer authentication function.
A missing conversation and another customer's conversation both return 404.
Invalid input returns 422, stale versions and busy conversations return 409, and refresh failures return 503.
Errors use the existing `{ errorCode, message }` response.

## Storage and replay

The customer ID and create request ID have a database uniqueness constraint.
Internal revisions protect each whole-record update with compare-and-set.
Public versions change when the view changes, including selection changes.
Both command kinds require the exact public version.
A repeated request ID with the same input returns the current saved view without repeating its mutation.
Reusing an ID with different input returns `idempotency_conflict`.

Before a hosted write, storage saves the request ID, message, selected option snapshots, and a 90-second lease.
The service waits at most 55 seconds, longer than the provider's 45-second request timeout.
A failed or timed-out write becomes uncertain because the provider might have accepted it.
An expired lease also becomes uncertain on GET.
Neither GET nor replay creates another session or resends an uncertain message.
Pending inputs remain available for investigation, but this API does not implement an explicit resend operation.
A read cannot prove acceptance of an unacknowledged send, so uncertainty remains even if the session later returns a proposal.
Deployment request-duration limits have not been verified.

Customer selections are authoritative snapshots.
A selected ID toggles off, a new venue replaces the selected venue, and supplies allow multiple selections.
Selections survive proposals that omit their options and do not call the agent.
The next customer message includes the current snapshots.

The saved session sequence is the accepted turn baseline while the agent is working.
Progress reads must not advance it because completion can arrive at the same sequence as a working snapshot.
Terminal results advance the sequence.
Assistant messages contain the proposal summary and next question with a session-and-sequence ID.
Repeated snapshots do not duplicate messages or increment the public version.

## Explicit local development database

Set `NODE_ENV=development` and `PLANNING_LOCAL_DB_DIR=.scratch/local-planning-db` to use persistent PGlite for planning only.
The runtime opens the database lazily and applies committed migrations to that local database.
It does not connect to Neon when the explicit development override is active.
Keep that directory ignored and use one development server per database directory.
The runtime reuses its local database owner across development hot reloads.

Production ignores `PLANNING_LOCAL_DB_DIR` and requires `DATABASE_URL`.
Production startup does not run migrations.
The existing transaction Store configuration remains unchanged.
`getPlanningDeps()` is asynchronous because local database initialization can apply migrations.

## Verification

Run `npm test -- src/server/planning src/server/db/store.test.ts src/agent/planning` for the focused local checks.
The tests use migrated PGlite and injected fake agents, including a file-backed close-and-reopen test.
They do not call a live provider or a hosted database.
The lead owns generated route registration, combined application checks, and browser verification.

## Venue inquiry drafts

The `prepare_inquiry` command creates a draft for the saved selected venue when research is ready.
The `save_inquiry` command requires the conversation version, inquiry ID and exact draft revision.
Draft creation and editing never invoke the planner or email provider.
The existing JSON conversation record stores the optional inquiry; old records remain valid.

Draft text uses the customer's messages in order and asks for availability, capacity, total costs, deposits and cancellation terms.
Prefilled contacts must appear in both a published fact and its source excerpt.
An absent or ambiguous contact stays empty and can be entered manually.
Changing the recipient removes the old source attribution.

New customer messages and venue changes mark the saved draft stale.
The customer must explicitly replace an outdated draft.
Revision conflicts retain local editor text instead of silently adopting another tab's baseline.
The approved-send boundary is described below.
The real mail adapter, inbound interpretation and supplier commitments are not connected yet.

## Approved inquiry sends

`SupplierMailTransport` in `supplier-mail.ts` is the transport interface for Ujjwal's adapter.
Inject it as `PlanningDeps.mail`; the runtime currently leaves it unset.
The HTTP projection advertises `canSendInquiry` only when that dependency is present.

The `send_inquiry` command includes the inquiry ID, expected draft revision, conversation version and request ID.
The server loads the approved recipient, subject and text from the saved draft rather than accepting replacement fields in the send request.
It saves approval and pending status before calling `sendInquiry` once.
The adapter receives `requestId`, `conversationId`, `inquiryId`, `draftRevision`, `to`, `subject` and `text`.

Accepted results require `messageId`, nullable `threadId` and ISO `acceptedAt`.
Failed results require `code` and `reason`; the customer sees a generic rejection message.
Uncertain results require `operationId` and may include message and thread IDs.
A malformed response, thrown error or timeout remains uncertain and is never automatically resent.
The server can retry database settlement without retrying the provider write.
A pending send left by a crashed request becomes uncertain after its saved deadline on a subsequent read.

The editor locks the approved message once a send has been attempted.
The customer can explicitly replace a rejected inquiry; its previous draft and send result remain in the record's inquiry history.
An uncertain send cannot be replaced automatically.
Reloaded pending sends trigger read-only status checks until the application records an outcome.
Provider acceptance is not delivery or a supplier reply.

The next integration step is to inject the verified real adapter and run an approved controlled-inbox send.
Read-only provider reconciliation, inbound correlation, reply interpretation and offer display remain separate incomplete work.
No real provider send occurred during controlled implementation verification.
