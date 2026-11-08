# Research event options with verified evidence

Type: spec
Status: open
Label: ready-for-agent
Owner: Tony
Scope: research-only agent workflow

## Problem statement

A customer planning an event must find venues and supplies that fit their requirements and budget.
Search listings alone often omit prices, availability, delivery costs, or cancellation terms that may be available on supplier detail pages or through existing tools.
The workflow must investigate those sources before treating missing details as unavailable.
A plausible recommendation can therefore mislead the customer into believing an option meets constraints that have never been checked.
The team also needs a consistent research result that the frontend can display without interpreting model prose as supplier evidence.

## Solution

Accept the customer's event brief and return source-backed venue and supply candidates with an explained recommendation.
Identify missing requirements before searching, investigate promising suppliers beyond search listings, and distinguish known facts, estimates, and remaining unknown details in the result.
Show progress while research runs and return useful partial results when some sources fail.
This workflow helps the customer compare options; it does not commit to suppliers or create a bookable event plan from incomplete evidence.

## User stories

1. As a customer, I want research to use my event type, location, schedule, headcount, budget, supplies, and cancellation tolerance, so that results reflect my event.
2. As a customer, I want focused questions for missing essential requirements, so that I can provide what research needs.
3. As a customer, I want the workflow to retain information I already supplied, so that I do not answer the same question again.
4. As a customer, I want recommendations to change when my brief changes, so that outdated preferences do not control the result.
5. As a customer, I want suitable venue candidates and related supply candidates, so that I can assess the event as a whole.
6. As a customer, I want the number of options to reflect useful results, so that the service does not invent options to fill a fixed count.
7. As a customer, I want specific venues distinguished from category pages, so that I know whether an actual venue has been identified.
8. As a customer, I want source links and observation times, so that I can assess the basis and freshness of each claim.
9. As a customer, I want unknown availability and capacity to remain explicit, so that a search listing is not mistaken for confirmation.
10. As a customer, I want prices identified as estimates or verified quotes, so that I understand their reliability.
11. As a customer, I want supply quantities to account for pack sizes, so that the recommendation covers the required headcount.
12. As a customer, I want taxes, delivery, and other unknown costs shown, so that an incomplete subtotal is not presented as my final total.
13. As a customer, I want budget fit reported only when the supporting costs are adequate, so that I can trust the recommendation.
14. As a customer, I want cancellation terms marked as known or unknown with their source, so that free cancellation is never assumed.
15. As a customer, I want to understand why an option ranks well and which constraints remain unchecked, so that I can compare tradeoffs.
16. As a customer, I want clear progress and an actionable explanation when research fails, so that I know what happens next.
17. As a customer, I want partial results labeled with their gaps, so that I can use available evidence without mistaking it for complete research.
18. As a customer, I want recommendations based on actual supplier information, with estimates and unconfirmed details clearly identified, so that I understand what is ready to act on.
19. As a customer, I want research to avoid contacting suppliers or spending money on bookings, so that researching my brief does not create commitments.
20. As a frontend developer, I want one versioned result contract, so that I can display candidates and errors consistently.
21. As an integration developer, I want durable run identity and ordered progress, so that resuming a consumer does not duplicate updates.
22. As an agent-workflow developer, I want invalid model conclusions rejected, so that valid JSON alone cannot bypass evidence requirements.
23. As a reviewer, I want recorded checks and provider evidence separated from untested capabilities, so that I can assess readiness honestly.

## Delivery priority

The user-story numbers identify requirements; they are not implementation priority.
Deliver one complete useful research flow before expanding provider coverage or recovery scenarios.

1. Establish the minimum shared input and result contract with Ujjwal, then run one complete real brief through venue and supply discovery using existing tools.
2. Investigate promising supplier detail pages for prices, capacity, quantities, delivery, and cancellation terms using suitable APIs, extractors, or browser tools.
3. Normalize the evidence and return a ranked recommendation with sources, quantity calculations, explicit remaining unknowns, and defensible budget conclusions.
4. Integrate the result and basic progress with the frontend through the shared application contract.
5. Broaden provider coverage and harden replay, disconnect, crash recovery, and uncommon failure cases.

Source provenance, essential input validation, credential protection, bounded execution, and rejection of unsupported claims are required in the first working flow.
Basic tool-failure and malformed-output handling are also part of that flow; the later recovery work extends them.
The first slice can use one supported location, venue source, and product source, while still responding to the actual brief.
Full supplier execution remains a later feature.

## Implementation decisions

- Preserve the merged TanStack Start and Bun baseline and the agreed team ownership.
- Tony owns research orchestration, evidence normalization, recommendation generation, and supplier research adapters.
- Ujjwal owns shared schemas, durable application storage, worker startup, and integration configuration.
- Leo consumes the shared result and progress contract through the application boundary.
- Use one research-workflow entry point accepting an event identity, brief revision, normalized requirements, and run identity.
- Missing essential requirements return an awaiting-input outcome with specific missing fields before paid searches begin.
- The result carries contract version, event and brief identity, candidates, ranking reasons, missing information, warnings, and research outcome.
- Each candidate carries its kind, supplier identity when known, source references, observation time, evidence mode, price provenance, quantity information, and explicit verification status for relevant requirements.
- Make real supplier research the normal customer and judge-demo path.
- A sample event researched against real sources is a live research demonstration and does not require a fake-data label.
- Keep synthetic fixtures in tests and record retrieval provenance internally.
- If a fallback actually uses simulated results, identify that affected step clearly rather than presenting it as real retrieval or completed supplier work.
- Distinguish a research result from an Event plan and from Booking confirmation or Action approval as defined in the glossary.
- Use hosted Naive pi for recommendation generation, subject to verified account capabilities.
- Keep the tested model configurable; the low-cost model used in research is not approved as a quality benchmark.
- Prefer working existing tools, sponsor services, SDKs, and integrations over building equivalent capabilities from scratch.
- Integration quality and successful customer outcomes take priority over minimizing provider usage or consuming every sponsor offering.
- Team sponsor credits are available; budget scarcity is not a reason to choose an inadequate tool or model, while execution remains bounded and observable.
- Use the tested Monid place and product endpoints as initial candidates, not an exclusive provider decision.
- Before implementing a scraper or other custom provider capability, inspect existing options and record why the selected tool fits or why existing options are insufficient.
- Evaluate Apify for supplier detail extraction, including its Website Content Crawler and relevant supplier-specific Actors, alongside suitable direct APIs and existing browser tools.
- Consider other sponsor tools when they fill a concrete gap; do not require an integration that adds no useful capability to the flow.
- Verify each selected tool on representative supplier pages and record returned fields, missing fields, authentication needs, latency, and observed failure behavior.
- Prefer the tested REST path when it meets the need; adopt direct MCP only after its authentication and end-to-end behavior are verified.
- Keep provider selection behind the research adapter boundary so a better-supported tool can replace it without changing customer-facing contracts.
- Follow discovery with targeted supplier-page investigation rather than returning search snippets as a completed recommendation.
- Capture which source checks were attempted and why remaining fields are unknown, such as absent content, access failure, or information requiring supplier contact.
- A generic opening-hours field or price bracket does not establish date-specific availability or a final event quote.
- Use an explicit endpoint allowlist and bounded result pages; a generic tool-execution capability must not grant access to arbitrary mutations.
- Source content is untrusted data and cannot alter tool permissions, request credentials, or authorize additional actions.
- Keep provider credentials server-side and outside prompts, status files, and customer-visible output.
- Treat category pages as discovery leads, not specific venue candidates with established capacity or availability.
- Normalize required units and pack sizes before estimating quantities and supply costs.
- Preserve unknown prices, taxes, delivery costs, dates, availability, and terms instead of filling them with model guesses.
- Represent budget fit as within, over, or unknown with its evidence basis; unknown required costs prevent a within-budget claim, while a known subtotal above budget can establish over-budget.
- Compare amounts only in compatible currencies and keep application minor units separate from Naive's micro-USD usage units.
- Require explicit provenance for cancellation claims and preserve relevant affiliate disclosures on product links.
- Validate the structured output and its meaning against normalized evidence before returning a recommendation.
- Allow at most one corrective turn for missing or malformed structured output, reusing the evidence without repeating searches.
- If correction fails or unsupported claims remain, return a validation failure or a clearly partial result containing only supported candidates.
- Carry brief revision through the run and prevent an older result from replacing the current brief's recommendation.
- Persist provider session identity and the last fully processed sequence through Ujjwal's storage boundary.
- Consume progress by sequence rather than timestamp order and tolerate duplicate delivery.
- Distinguish running, awaiting-input, successful research, partial research, failed research, and canceled research from the provider's own session status.
- Inspect stop reason and result validation when a stream ends; idle or stream closure alone is not success.
- Bound provider calls, elapsed work, and usage through configuration and preserve failure evidence without exposing credentials.
- Record uncertain provider creation outcomes and reconcile before retrying creation with the same stable idempotency identity.
- Mark a required tool failure or degraded connection explicitly; never substitute invented evidence.
- Shared schema changes require Ujjwal's coordination and review by affected consumers before implementation integration.

## Testing decisions

Tony confirmed one primary boundary: submit an event brief to the research workflow and observe recommendations, evidence, unknowns, and progress using controlled provider responses.
Test externally observable behavior at this boundary rather than private functions, exact prompt wording, or internal call order.
Use deterministic provider doubles and shared fixtures for routine checks.
The repository currently has no established application test suite; Ujjwal's foundation task supplies the runner, shared schemas, fixtures, and CI.
The live research experiment supplies prior examples of missing structured output, an unsupported budget claim, category-page results, pack-size mismatch, and replayed event sequences.
Those examples are evidence for regression scenarios rather than a production test suite.

Acceptance checks include the following:

1. A complete brief produces candidates linked to the correct event and brief revision with source provenance.
2. A brief missing essential requirements returns focused missing fields without issuing searches.
3. Supplied requirements are not falsely reported as absent.
4. Changed location, quantity, or budget affects filtering or ranking using controlled evidence.
5. Missing final costs prevent an unsupported within-budget claim even when model JSON validates.
6. A requirement for twenty units with eight-unit packs produces a three-pack requirement when packs are indivisible.
7. Category pages do not become exact venues, and unknown availability, capacity, or cancellation terms remain unknown.
8. Stale evidence is labeled and cannot support a current verified claim without revalidation under the configured freshness policy.
9. One corrective turn can recover malformed output; repeated failure terminates within the configured limit.
10. A failed source produces an explicit partial or failed outcome rather than fabricated candidates.
11. Replayed progress does not duplicate customer-visible updates, and an idle error is not successful completion.
12. A stale brief revision cannot overwrite newer results.
13. A sample event can use real retrieval without being mislabeled as fake; truly simulated fallback evidence remains distinguishable and cannot be presented as live supplier evidence.
14. Untrusted source instructions cannot trigger supplier outreach, purchases, or credential disclosure.
15. Cancellation stops scheduling new research calls and reports any in-flight outcome without claiming that a supplier transaction was canceled.
16. When a discovery result lacks terms or prices but the supplier detail source provides them, the workflow investigates that source and preserves the retrieved evidence.
17. If detail retrieval fails or the source omits a needed field, the result records the gap without inventing a value.
18. The selected discovery and detail-extraction tools work together on a representative live brief before the integration is called verified.

Keep a small opt-in live smoke test separate from deterministic CI.
It should exercise bounded Naive output and the selected discovery and detail-extraction integrations, validate result shape and provenance, and clean up evaluation resources.
It must not assert exact search rankings, venue availability, or prices as stable fixtures.
Real approval resumption, forced-disconnect recovery, and crash recovery need separate evidence before those capabilities are claimed.

## Out of scope

Supplier outreach, negotiation, reservations, purchases, customer payment, supplier funding, cancellation execution, and refunds are outside this research feature.
Invitations, guest management, hosting, the development chief-of-staff system, framework migration, and frontend implementation are outside this spec.
This spec does not authorize new provider accounts, unrestricted tool access, or live supplier commitments.
Creating implementation tickets and application code is a subsequent step.

## Further notes

The [readiness report](https://github.com/22Ujjwal/we-gotchu/blob/285abe6736b1062396dfeded5ca8f620680a8f53/docs/research/agent-research-readiness.md) records the authenticated experiments and primary sources.
Naive search and progress worked, but valid structured output required correction and the resulting recommendation still contained an unsupported budget claim.
Monid place and product retrieval worked separately; hosted Naive-to-Monid MCP was not tested.
Apify's [Website Content Crawler](https://apify.com/apify/website-content-crawler) documents extracting website content, including JavaScript-rendered pages.
Its [Google Maps Scraper](https://apify.com/compass/crawler-google-places) documents business details, supplier website links, and selected pricing fields.
Those documented capabilities justify evaluation, not a claim that exact event availability, checkout costs, or supplier cancellation terms have already been verified.
Supplier-specific Apify extraction has not yet been tested for this project.

Implementation must settle the precise shared schemas with Ujjwal and Leo, freshness thresholds by evidence type, default research budgets and timeouts, and the model used for quality evaluation.
These are bounded implementation choices, not claims that the existing foundation already implements them.
The ready-for-agent label marks this specification for the next workflow step; it does not remove dependencies or approve changes to another owner's files.
