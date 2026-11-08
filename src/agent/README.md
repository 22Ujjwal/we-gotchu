# Read-only research workflow

Ticket 01 provides researchEvent with the shared contract 0.4 input and result.
Call it with createDiscovery and one createNaiveRanker instance per research run.
The workflow validates input before paid discovery, retrieves venue and supply leads, asks the model to order only existing candidate IDs, and returns source-backed candidates.
The model cannot modify supplier facts or add unsupported budget claims to the result.
The first slice deliberately returns partial research with unknown final costs.
Supplier detail extraction and complete budget calculations belong to tickets 02 and 03.

## Runtime boundary

These modules are server-side code and must not be imported by frontend components.
Supply credentials explicitly from server configuration, never from the brief or model messages.
The provider paths are fixed to two read-only Monid discovery endpoints and the Naive session lifecycle.
Naive ordinary tools are denied; its structured-output mechanism remains available.
The direct REST path reuses the authenticated research path without adding another root dependency.
The existing Monid CLI was used to inspect the provider schemas before implementation.

researchEvent is an asynchronous workflow that may take up to its configured timeout, currently 120 seconds by default.
It is not a short HTTP request handler and must not be called directly inside an application polling request.
It provides the agreed test boundary and standalone execution for ticket 01.
The database-backed startResearch and advanceResearch interface remains integration work with Ujjwal under ticket 05.
That integration must persist evidence as well as session identity, use the backend's lease and stale-revision rules, and coordinate correction retries.
No database implementation or shared schema is changed here.

createNaiveRanker exposes recommend, checkpoint, and dispose.
Always call dispose in a finally block, and record any cleanup failures for reconciliation.
Supply a durable checkpoint callback before deployment; the smoke script writes a local recovery file.
Provider creation uses stable idempotency headers and is not automatically retried after uncertain responses.
Full reconciliation after uncertain creation and process recovery remain ticket 06; do not treat this in-process workflow as crash recovery.
Never share a ranker instance between runs.

## Verification

Run bun run test and bun run typecheck.
This machine required Bun 1.4.4 to read the merged lockfile; Bun 1.3.11 could not parse its version.
No lockfile conversion or root configuration change was made.
Controlled tests submit briefs at the workflow boundary, including tests with real adapters against controlled HTTP responses.
They cover missing input, evidence preservation, malformed output, bounded correction, source failure, hostile supplier text, cancellation, and deadlines.

The optional live smoke command is bun src/agent/smoke.ts.
It requires RESEARCH_LIVE_SMOKE=1, NAIVE_API_KEY, MONID_API_KEY, and RESEARCH_CHECKPOINT_PATH.
RESEARCH_RESULT_PATH optionally saves the resulting research document.
NAIVE_MODEL selects the model; the smoke default is openai/gpt-4.1-nano, which is not a quality benchmark.
The smoke uses a synthetic future San Francisco birthday brief with real supplier discovery.
It performs no supplier contact, booking, purchase, payment, or refund.

On 2026-11-07, the live workflow returned six candidates, three venues and three supply products, from two successful Monid calls.
Naive produced a valid candidate ordering after one correction, and cleanup returned no errors.
The result was partial with budgetFit unknown, as required for discovery-only evidence.
The run was smoke-4744a204-dd09-4ee6-a820-445cc207e337.
Monid run references were 01M6WDMAQNJBZ131VRPRB6HRTT and 01M6WDMHB8GKE316RX2RAFN5EQ.
The checkpoint and sanitized result remain locally at /tmp/we-gotchu-ticket01-checkpoint.json and /tmp/we-gotchu-ticket01-result.json.
Exact prices, date availability, capacity, and cancellation terms were not verified.

## Remaining limits

The current discovery adapter uses the US product catalog and one bounded search combining the requested supply needs.
It does not establish that every requested supply category has adequate coverage.
Candidate quantities and prices remain unknown until detail extraction and normalization are implemented.
The complete UI, database persistence, polling, and crash recovery have not been tested by this slice.
GitHub CI is unavailable due to the billing issue reported by the team, so local verification must be recorded on the PR.
