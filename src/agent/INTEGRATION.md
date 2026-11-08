# Bounded application research

Ticket05 connects the application research port to hosted recommendation sessions.
It does not run the long standalone workflow in the background or keep a request open until the hosted model finishes.
Each application poll performs one bounded stage and saves private state through the database store.
The request limit is ten seconds by default and cannot exceed ten seconds through integration options.
The default run deadline is two minutes, including time between customer polls.
A customer must keep polling for later stages and cleanup to execute.
There is no independent worker or scheduler.

## State and evidence

startResearch initializes a checkpoint and returns a null session ID because discovery precedes hosted session creation.
Polling performs discovery, optional enrichment, definition creation, session creation, recommendation polling, optional correction, and cleanup in separate stages.
The hosted service performs model work between requests.
The existing discovery adapter honors the request's abort signal; slow discovery can fail within this shorter application deadline.
This integration does not make the existing Monid discovery loop resumable.

The private runs.research_checkpoint column retains the input identity, validated evidence, source checks, stage, definition and session IDs, processed snapshot sequence, correction acceptance sequence, deadline, and validated outcome.
The checkpoint is absent from EventView and model prompts.
Only normalized candidates and the brief enter the model prompt.
The integration reuses researchEvent for input, candidate, ranking, and result validation with saved providers.
It does not copy supplier extraction or semantic validation logic.
A provisional discovery order is private checkpoint data and is never published as a model recommendation.

IntegrationProviders.enrich accepts input, saved Discovery evidence, and an AbortSignal and returns Discovery.
It runs after validated discovery in its own stage and before hosted ranking.
The configured factory accepts the same optional function.
Ticket02 can supply createDetailEnricher through this parameter or configureDeps without changing extraction code here.
No default detail provider is wired in this branch because that implementation belongs to the independent ticket02 session.

Provider snapshots use last_seq for ordered progress.
The application records a safe milestone only when the provider sequence advances.
It never forwards raw transcript events, private diagnostics, or credentials.
Saving the checkpoint, updating Run.lastSequence, and appending visible progress happen in one database transaction.
A duplicate snapshot can be revalidated after an interruption without appending the same milestone again.
This is snapshot processing, not full provider transcript replay.

Idle alone never completes research.
The integration requires an end_turn stop reason and validates structured output against saved evidence.
Provider errors, intervention states, usage excess, timeouts, and malformed output preserve available evidence as partial or failed research.
One malformed ranking can trigger one corrective message.
The correction waits for a sequence strictly greater than accepted_seq before consuming the next output.
Unsupported supplier claims cannot enter the recommendation through model output.
The current discovery-only validator deliberately returns partial research with unknown final costs, including after valid ranking.
The shared success outcome remains supported by the application contract, but this implementation does not manufacture a successful or bookable result.
The application rejects incomplete briefs with its existing 422 response; the research port separately supports awaiting_input for invalid research input.

## Cancellation and uncertainty

Every step checks the event revision, cancellation marker, active run, checkpoint version, and lease before provider work and before saving results.
The database rejects stale checkpoint writes and stale result publication.
An older request cannot release a replacement request's lease.
Cancellation fences new steps before waiting for the hosted stop operation.
A session returned after cancellation is stopped and its cleanup outcome is retained privately.
If stopping a known session fails, customer progress reports that provider reconciliation is needed.
Cancellation never claims to cancel a supplier booking, purchase, or refund.

Before provider creation or correction, the integration durably marks the operation uncertain.
A replacement request does not blindly repeat that operation.
Stable idempotency identities remain derivable from the stored run ID.
An uncertain creation response can still leave an unknown remote resource, and an interrupted cleanup can still require operator reconciliation.
Saved IDs and cleanup confirmations support that work, but automatic resource discovery, forced-disconnect recovery, and full crash recovery remain ticket06.
No live crash-recovery claim is made here.

## Configuration and owner review

Ujjwal's review is required before merge.
Tony authorized isolated backend changes for this PR, overriding the normal rule that the backend owner implements shared changes first.
The public shared schemas and contract version remain unchanged.
The affected consumers are the application event service, production dependency wiring, the database store, and backend test stores.
Leo consumes the existing EventView result, run, and progress fields without a frontend change.

The backend changes are deliberately limited to these needs.

- Store gains optional researchCheckpoints methods, implemented by the database store.
- ResearchPort.startResearch may return a null session ID until discovery completes.
- Result publication and lease release accept the claimed lease timestamp as a fence.
- Checkpoint writes reject expired leases, stale revisions, and canceled events atomically.
- Cancellation failures produce safe customer progress instead of only a server log.
- Dependency wiring chooses real research by default and simulation only with RESEARCH_MODE=simulated.
- Migration 0001 adds the private checkpoint column and its matching schema snapshot.

Apply the existing database migration command before deploying this code.
Set NAIVE_API_KEY, MONID_API_KEY, and an explicitly selected NAIVE_MODEL on the server.
Missing configuration fails instead of substituting synthetic data.
This branch adds no dependency or root configuration changes.
The generated route tree also required regeneration because the supplied base had an incomplete route declaration and would not typecheck.
That repair is a separate commit and changes no handwritten frontend implementation.

## Verification and consumer examples

integration.test.ts exercises createEvent, getEventView, and cancel against the real database store with controlled providers.
It also exercises the real Monid and hosted-session REST adapters against controlled HTTP responses through those application handlers.
checkpoint.test.ts verifies atomic progress, lease replacement, cancellation, stale revisions, and result-publication fences against migrated PGlite storage.
These are deterministic application-boundary checks, not authenticated hosted-service or Neon deployment evidence.
No supplier contact or transaction occurred.

integration.fixtures.ts contains synthetic examples for Leo covering running progress, missing input, partial research, failure, and cancellation.
All candidate examples retain simulated evidence mode.
These fixtures are never production fallbacks.

Run the repository test, typecheck, and build scripts with Bun 1.4.4.
The complete suite currently contains 158 tests across 13 files.
The final PR handoff records the exact tested commit and remote check state.
Live deployment, chosen-model quality, real application latency, and the combined ticket02 detail-provider path remain unverified.

## Provider references

The implementation was checked against the [session API](https://usenaive.ai/docs/api/sessions.md) and [definition API](https://usenaive.ai/docs/api/agents.md) on 2026-11-07.
Session creation starts hosted execution, message submission returns accepted_seq, and polling returns status, stop_reason, structured output, and last_seq.
Cancel is idempotent for canceled sessions, but completed and failed sessions reject cancel with a terminal-state conflict.
The integration avoids that call for a terminal snapshot.
