# Read-only research workflow

Ticket 01 provides researchEvent with the shared contract 0.4 input and result.
Call it with createDiscovery, optional createDetailEnricher, and one createNaiveRanker instance per research run.
The workflow validates input before paid discovery, retrieves venue and supply leads, asks the model to order only existing candidate IDs, and returns source-backed candidates.
The model cannot modify supplier facts or add unsupported budget claims to the result.
Invalid or repeated discovery results are skipped with a warning, and the remaining evidence is kept.
A brief without a valid currency returns awaiting_input like any other missing field.
The first slice deliberately returns partial research with unknown final costs.
Ticket02 adds bounded supplier detail evidence before ranking.
Complete budget and quantity calculations remain ticket03 work.
See [supplier detail evidence and verification](../../docs/research/supplier-detail-evidence.md) for the adapter limits, provider choice, and evidence rules.

## Runtime boundary

These modules are server-side code and must not be imported by frontend components.
Supply credentials explicitly from server configuration, never from the brief or model messages.
The provider paths are fixed to two read-only Monid discovery endpoints, two optional read-only detail endpoints, and the Naive session lifecycle.
Naive ordinary tools are denied; its structured-output mechanism remains available.
The direct REST path reuses the authenticated research path without adding another root dependency.
The existing Monid CLI was used to inspect the provider schemas before implementation.

researchEvent is an asynchronous workflow that may take up to its configured timeout, currently 120 seconds by default.
It is not a short HTTP request handler and must not be called directly inside an application polling request.
It provides the agreed test boundary and standalone execution for ticket 01.
The database-backed application integration is on PR #24, with bounded per-request stages and private checkpoints.
See [application integration and verification](INTEGRATION.md) for configuration, cancellation, migration, dependencies, and remaining limits.
It reuses validation with saved evidence and immediate callbacks; it does not run the standalone hosted polling loop inside an application request.
Ujjwal's owner review remains pending, and the application path has controlled-provider tests rather than live deployment proof.

createNaiveRanker exposes recommend, checkpoint, and dispose.
Always call dispose in a finally block, and record any cleanup failures for reconciliation.
The checkpoint uses the contract Run field names naiveSessionId, lastSequence, and correctionsUsed, plus agentId.
After the correction message, polling waits for a session sequence past the message's accepted_seq, so the previous turn's output is never reused.
Supply a durable checkpoint callback before deployment; the smoke script writes a local recovery file.
Provider creation uses stable idempotency headers and is not automatically retried after uncertain responses.
Full reconciliation after uncertain creation and process recovery remain ticket 06; do not treat this in-process workflow as crash recovery.
Never share a ranker instance between runs.

## Verification

Run bun run test and bun run typecheck.
This machine required Bun 1.4.4 to read the merged lockfile; Bun 1.3.11 could not parse its version.
No lockfile conversion or root configuration change was made.
Controlled tests submit briefs at the workflow boundary, including tests with real adapters against controlled HTTP responses.
They cover missing input, evidence preservation, invalid or duplicate discovery results, malformed output, bounded correction, source failure, hostile supplier text, cancellation, and deadlines.

The optional live smoke command is bun src/agent/smoke.ts.
It requires RESEARCH_LIVE_SMOKE=1, NAIVE_API_KEY, MONID_API_KEY, and RESEARCH_CHECKPOINT_PATH.
RESEARCH_RESULT_PATH optionally saves the resulting research document.
NAIVE_MODEL selects the model; the smoke default is openai/gpt-4.1-nano, which is not a quality benchmark.
The smoke uses a synthetic future San Francisco birthday brief with real supplier discovery and bounded detail investigation.
It checks up to two selected candidates, with at most two venue pages and one product record.
It requires detail provenance for both kinds and a sourced product listing price before reporting success.
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
Selected product listing prices are retained as sourced verification notes.
The total priceEstimate and required quantities remain unknown until ticket03 calculates them.
Venue excerpts remain unverified and cannot establish event-specific terms.
The standalone slice does not prove the UI, application deployment, or crash recovery.
PR #24 separately tests database persistence and bounded application polling with controlled providers.
The GitHub ci check passed on PR #18; still record local verification on each PR.
