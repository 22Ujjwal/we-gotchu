# Interrupted research recovery

Ticket06 builds on `ce2d672408be7defc30fad4d09db47b39ba28054`.
This handoff describes controlled local tests, not deployed or live provider recovery.

## Behavior

A replacement service loads the saved run, brief revision, provider session ID, evidence, correction budget, deadline, and last fully processed sequence.
It does not create another session when that identity is already stored.
A disconnected session read keeps the checkpoint in ranking and permits up to three failed reads across the whole run.
The retry count survives service and database replacement, including interruption immediately after the final failure is recorded.
The existing run deadline still bounds recovery, and the next application poll drives each step.
There is no background recovery worker.

A ranking cursor commits in the same database transaction as the resulting state or validated result and progress.
A failed checkpoint write does not turn a valid ranking into a generic failed result.
When a database acknowledgement is lost, the next request reads persisted state before deciding what to do.
The integration does not cancel a resource merely because the write that stored its ID may have committed without an acknowledgement.
Repeated or older running snapshots do not duplicate progress or move the cursor backward.
Discovery and investigation publish progress with their saved outcomes, so restarting an uncommitted read does not repeat a start message.
Read-only discovery can repeat when its evidence never committed.

Before agent creation, session creation, or correction dispatch, the checkpoint records the operation kind, stable idempotency key, and intent timestamp.
A successful acknowledgement clears that pending operation together with the returned identity or correction boundary.
An uncertain operation is not automatically dispatched again.
The result retains saved evidence, excludes unsupported recommendations, and explicitly requires provider reconciliation.
Known resource cleanup does not imply that a resource hidden by a lost create response has been found or stopped.
The private cleanup record remains unconfirmed while that create is unresolved.

Cancellation and brief replacement fence checkpoint writes through the existing database lease and revision checks.
A correction invalidates the previous stopped state before dispatch, because remote execution may resume before the response arrives.
Delayed initialization of a superseded run creates no checkpoint because initialization requires the run to remain running.
The merged missing-checkpoint startup grace period remains unchanged.

## Provider contract and limits

The inspected [provider overview](https://usenaive.ai/docs/api/overview.md#idempotency) documents POST response replay for the same key and exact request, conflicts for a changed request or concurrent use, and key release after a non-success response.
The [session API](https://usenaive.ai/docs/api/sessions.md) documents reads by session ID and session listing filtered by agent, deployment, or status.
Neither inspected page documents a lookup by idempotency key.
The existing client has create, snapshot read, correction, cancellation, and agent deletion operations.
No new provider endpoint was invented or added.

Persisting a key alone does not preserve an exact original request body across model configuration or software changes.
This implementation therefore stops uncertain creates for reconciliation instead of reconstructing and replaying a POST.
An authorized operator must resolve the pending operation against provider evidence before attempting a replacement operation.
Automated reconciliation and automated retry of uncertain creates are not implemented.
A separately authorized bounded live check is still required to validate provider behavior, deployment persistence, process interruption, and cleanup in the deployed environment.
A lost response can leave an unknown remote resource running, and this branch reports that limit rather than claiming cleanup.
Supplier execution, approval resumption, payments, and supplier cancellation are outside this ticket.

## Controlled verification

`src/agent/recovery.test.ts` uses a temporary on-disk PGlite database with the committed migrations.
Tests close the database and construct a new database connection, store, dependencies, and integration over the same files.
They inject failures before and after checkpoint commits through the application service boundary.
This proves persistence across replacement instances, not operating-system crash durability or hosted database recovery.

Coverage includes disconnected reads, exhausted retries, repeated and older sequences, uncommitted discovery, lost session and result acknowledgements, uncertain operation intents, cancellation, brief replacement, and delayed startup.
Controlled HTTP tests exercise the actual REST adapter and verify one create per operation with the expected idempotency keys.
Existing tests cover degraded discovery, run and usage bounds, missing checkpoints, cleanup, and the merged startup race.
No test requires existing credentials or makes live provider mutations.

Use Bun 1.4.4 with the unchanged frozen lockfile.
Required commands are `bun run test`, `bun run typecheck`, `bun run build`, and `node --test tools/team-coordination/*.test.mjs`.
The PR handoff reports the exact tested commit and results.

## Cross-ticket integration

Ticket03 owns ranking validation and recommendation calculations in `research.ts`.
Recovery continues to call the existing `researchEvent` and `rankingCandidates` entry points.
Ticket03 also owns its coordinated listing-price assertion adjustment in the existing integration test; this branch does not edit that block.
Ticket04 owns changed-brief acceptance and `updateBrief` service logic.
This branch tests its existing entry point without modifying that service.
The merge coordinator should rerun the complete suite, typecheck, and build after combining these branches, particularly revised-brief publication and the recommendation shape assertions.
PR28 owns store implementations, schema, and payment work; this branch changes none of those files.
New private checkpoint fields are optional JSON fields and require no schema migration or public contract change.
The branch must remain unmerged for the designated coordinator.
