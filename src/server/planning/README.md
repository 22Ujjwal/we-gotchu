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
