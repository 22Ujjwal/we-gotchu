# Bounded application research

Ticket05 connects the application research port to hosted recommendation sessions.
Each application poll advances one bounded stage and saves private state through the database store.
It does not detach work from a serverless request or wait for hosted model completion in a polling request.
The default provider-step limit is ten seconds and cannot be increased beyond ten seconds through integration options.
The default run deadline is two minutes, including time between customer polls.
The customer must keep polling for later stages and normal cleanup to execute.
There is no independent worker or scheduler.

## State and evidence

startResearch initializes a checkpoint and returns a null session ID because discovery precedes hosted session creation.
Polling performs discovery, investigating, definition creation, session creation, recommendation polling, optional correction, and cleanup in separate stages.
The hosted service performs model work between requests.
The standalone researchEvent validator is reused with saved discovery and immediate recommendation callbacks, never with the long hosted recommend loop.
Investigation uses the same validator, its enrichment identity checks, and its cooperative-abort grace period within the request deadline.
It preserves accumulated detail evidence when the adapter returns after its bounded signal aborts.
A provider that ignores cancellation still cannot hold the polling request indefinitely during discovery, investigation, or ranking.
Slow sources can fail within the application deadline; this integration does not make Monid reads resumable.

The private runs.research_checkpoint column retains identity, evidence, source checks, stage, provider IDs, correction acceptance sequence, deadline, validated outcome, and cleanup confirmations.
Its types live in src/server/research-checkpoint.ts and reuse Run field types.
The Run columns remain authoritative for session identity, sequence, and correction count when a checkpoint is read.
Checkpoint updates save the mirrors in the same conditional transaction.
Private checkpoint fields are absent from EventView.

ResearchProviders['enrich'] is the single public enrichment type, and investigating is the shared stage name.
The configured factory wires createDetailEnricher by default after discovery.
It can also receive a controlled enrichment provider for tests.
The adapter implementation comes from PR #25 at 4148d5504ae262afb96a3e96f3f7f44ad9c6b9a8, integrated as an unmerged dependency.
No extraction or enrichment validation logic is copied into the integration.

rankingCandidates removes detail notes, affiliate prose, and other free-text evidence fields from the candidate payload before the initial hosted submission.
A corrective message reuses that projected session evidence and does not resend supplier text.
Original evidence remains available in the result for the reader.
Discovery names and source references remain in ranking input, so this is not a universal prompt-injection guarantee.
A known verification.listingPrice is listing evidence only.
It does not establish required quantities, delivered total, date availability, cancellation terms, or plan readiness.

Provider snapshots use last_seq for ordered progress.
The application records a safe milestone only when that sequence advances.
It never forwards raw transcript events, provider credentials, or private diagnostics.
Saving a checkpoint, updating Run.lastSequence, and appending progress happen in one transaction.
Result publication also saves the final sequence for ports that do not use private checkpoints.
A duplicate snapshot can be revalidated after an interruption without duplicating its milestone.
This is snapshot processing, not full transcript replay.

Idle alone never completes research.
The integration requires an end_turn stop reason and validates structured output against saved evidence.
One malformed ranking can trigger one corrective message under the existing canSendCorrection rule.
The correction claim and uncertain-operation checkpoint are saved together under the lease, rather than through a second independent recordCorrection transaction.
Polling waits for a sequence strictly greater than accepted_seq before accepting the next output.
Repeated warnings are deduplicated.
The current validator deliberately returns partial research with unknown final costs, including after valid ranking.
The application contract still supports success, but the integration never invents a successful or bookable result.
The application rejects incomplete briefs with its existing 422 response; the research port separately supports awaiting_input.

## Cancellation and uncertainty

cancelResearch accepts the Run, which exists before any hosted definition or session.
Both explicit cancellation and brief replacement look up that run's checkpoint and clean known resources, including a definition created before a session.
Every research step checks revision, cancellation, active state, checkpoint version, and lease before provider work and before saving results.
Late responses cannot publish results for a canceled or replaced brief.
A late provider resource is cleaned and its outcome recorded privately.
An older request cannot release a replacement request's lease.
Final research status changes also check the brief revision.

Cleanup records session-stop and definition-deletion confirmations separately.
A confirmed resource is not retried, and a later failure cannot erase its confirmation.
An unconfirmed resource remains retryable.
Cleanup sends the idempotent stop operation directly; a failed status GET cannot prevent it.
The documented session_terminal conflict counts as stopped, and not_found on deletion counts as absent.
Other provider errors remain failures.
Failed cleanup is retained privately and reported through safe progress or outcome warnings.
Cancellation never claims to cancel a supplier booking, purchase, or refund.

Before provider creation or correction, the integration durably marks the operation uncertain.
An uncertain checkpoint takes precedence over an expired run deadline, so the reconciliation warning is not lost.
Read-only discovery and detail failures are labeled as source failures instead.
A replacement request does not blindly repeat uncertain provider creation or correction.
Stable idempotency identities remain derivable from the stored run ID.
Confirmed cleanup concerns known IDs; an uncertain creation may still have produced an unknown remote resource.
Automatic resource discovery, forced-disconnect recovery, and full crash recovery remain ticket06.

A running legacy record without a checkpoint terminates with a visible failed outcome and a restart instruction.
The real provider never receives simulated session IDs from such records.
A legacy real session ID can be stopped on cancellation, but its missing definition identity may require reconciliation.

## Configuration and owner review

Ujjwal's ownership review remains required.
No owner approval or exception is recorded here.
The public shared schemas and contract version remain unchanged.
The affected consumers are the event service, dependency wiring, database store, and backend test stores.
Leo still consumes the existing EventView result, run, and progress fields.

The isolated backend changes are the optional checkpoint store, migration 0001, nullable startup session ID, run-based cancellation, configuration preflight, final-sequence publication, and lease/revision guards.
The integration receives only checkpoint storage and progress writing, not the whole transaction store API.
The composition root still selects the research implementation through ResearchPort.

Apply the existing database migration command before deploying this code.
Set NAIVE_API_KEY, MONID_API_KEY, and an explicitly selected NAIVE_MODEL on the server.
.env.example documents these and RESEARCH_MODE.
Real research is the default; RESEARCH_MODE=simulated explicitly selects labeled synthetic research.
Missing or invalid configuration returns research_not_configured before creating or replacing a run.
It is not an uncertain provider-creation outcome.
No dependencies, build configuration, or payment behavior were changed.

PR #26 supplies the generated route repair at 60e20a03cc2cb9bf10782ab905e39d23836d2485.
That exact commit is in this branch's ancestry and has no divergent route-file delta.
The dependency order is PR #26, then PR #25, then PR #24, subject to their owner reviews.
No PR merge is performed by this handoff.

## Verification and test examples

integration.test.ts exercises createEvent, getEventView, updateBrief, and cancel against migrated PGlite storage.
The combined configured-path test uses real discovery, detail, and hosted-session adapters with controlled HTTP responses.
It verifies sourced detail evidence, ranking-input projection, correction, cleanup, and rejection of listing prices as final totals.
Other boundary tests cover legacy records, deadline classification, duplicate progress, restored checkpoints, in-flight cancellation, and stale publication.
checkpoint.test.ts verifies atomic progress, authoritative cursors, lease replacement, and monotonic cleanup confirmations.
These checks are not authenticated hosted-service or deployed Neon application proof.
No live provider mutations, supplier contacts, or transactions were performed during review fixes.

integration.test-fixtures.ts contains synthetic contract examples used only by tests.
Leo can inspect their shapes, but frontend code must not import src/agent.
Moving examples into shared frontend fixtures remains a separate consumer-driven change requiring Ujjwal's coordination.

Run the repository test, typecheck, and build scripts with Bun 1.4.4.
Exact final head, test count, and GitHub checks are recorded in PR #24 and the coordinator handoff.
See docs/research/research-integration-review.md for all 18 comment dispositions and the matching Sol S1 finding.
Live application latency, deployment, and model quality remain unverified.
The historical ticket02 smoke is separate evidence and does not prove the combined application path.

## Provider references

The single-request client follows the [session API](https://usenaive.ai/docs/api/sessions.md) and [definition API](https://usenaive.ai/docs/api/agents.md).
Both the standalone ranker and the durable integration use that client.
Session creation starts hosted execution, message submission returns accepted_seq, and polling returns status, stop_reason, structured output, and last_seq.
Cancel is idempotent for canceled sessions; completed and failed sessions return the documented terminal conflict.
