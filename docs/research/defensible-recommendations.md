# Ticket03 recommendation evidence

The workflow retains the existing model ranking and strict candidate-ID validation.
The model cannot supply quantities, prices, availability, or budget verdicts.
Recommendations explain calculated supply coverage, listing subtotals, price differences between alternatives, and unchecked event requirements.
No fixed option count is added.

## Quantity and cost rules

Only the exact listingPrice and packSize note formats emitted by the ticket02 detail adapter are interpreted.
Both notes must be known, current, attributed to the same detail URL, and backed by the product-detail tool.
Arbitrary page excerpts, conflicting statements, multiple units, generic pieces, and unsupported note formats remain evidence for review.
The parser intentionally fails closed if the adapter changes its note format.

For a single matching requested plates, cups, or napkins need, the estimate assumes one item per guest.
This assumption is shown in unchecked constraints and does not establish the customer's actual consumption or exact product suitability.
Twenty estimated items in eight-item packs require three packs before multiplying the per-pack listing price.
Other supply needs remain unquantified.
Existing totals never substitute for an unavailable unit price or currency.

Application money uses integer minor units.
The supported listing currencies match the detail adapter's two-decimal currency list.
Currency codes compare without case sensitivity, and no exchange conversion occurs.
Unsafe integer arithmetic, fractional minor amounts, inconsistent major/minor amounts, and currency mismatches prevent calculation.
Provider usage micro-USD never enters event-cost arithmetic.

The first model-ranked calculable candidate for each supply need contributes to the displayed selection estimate.
Alternatives for that need do not accumulate into the subtotal.
An over verdict means this selected listing estimate exceeds the budget, not that every possible event plan is unaffordable.
The budget basis names the selected candidates and the quantity assumption.
Unknown venue costs, delivery, taxes, uncovered needs, and other required costs prevent within.
An absent subtotal stays unknown rather than becoming zero.
Simulated values remain labeled and cannot establish a current budget verdict.

The pure assessCosts helper supports within only for complete compatible required components.
The current workflow deliberately cannot report within because the existing supplier adapters do not establish a complete event total.
A listing subtotal retains supplier_listing provenance, never quote provenance.
Original source references, verification notes, cancellation terms, and affiliate disclosures remain available.

## Freshness policy

ResearchOptions.freshnessMs can override individual positive integer millisecond limits.
Defaults are listed below.

| Evidence | Maximum age | Reason |
| --- | --- | --- |
| Listing price | 24 hours | Retail prices can change daily, so older prices require retrieval again. |
| Pack size | 30 days | Packaging is less volatile than price, but old product variants should not be assumed current. |
| Cancellation terms | 7 days | Policies can change, so a recent attributed policy is required even to report terms available for review. |
| Availability | 15 minutes | Inventory is volatile; a recent source still would not establish an event-specific reservation. |
| Capacity | 30 days | Physical capacity changes less often, but the event's layout and restrictions still need evidence. |

These are conservative application defaults, not supplier guarantees or measured validity periods.
Freshness uses the attributed detail or quote source's retrievedAt, not the candidate's latest unrelated observedAt.
The exact age limit is accepted; older or future-dated sources are rejected.
Availability and capacity limits are defined for consistency but do not authorize parsing unverified venue excerpts into facts.
Even fresh cancellation text does not prove the brief's maximum acceptable cancellation loss.

## Verification and remaining boundaries

Controlled workflow tests exercise researchEvent and the real detail adapter with HTTP responses supplied by the test.
Coverage includes pack rounding, exact pack boundaries, changed headcounts, partial subtotals, required unknown costs, compatible currencies, conflicting notes, overflow, zero versus unknown prices, freshness limits, model ordering changes, unsupported model claims, and provenance retention.
The within calculation is tested at the cost-helper boundary; it is not a live workflow capability claim.
No provider mutation, supplier contact, billing, payment, or live resource creation is part of this implementation.

A new real-retrieval sample demonstration remains unverified.
No deployed sign-in, live application behavior, or live recovery has been verified by these tests.
Ujjwal owns deployment separately.
Review here is self-review plus any actual PR review findings, not a claim of human approval.

## Cross-ticket handoff

Ticket04 must test changed-brief invalidation through its application path.
This helper recalculates quantities from the current headcount, but does not own cancellation or publication races.
Ticket06 must preserve the call to researchEvent when validating saved evidence and ranker output.
That call applies current freshness and recalculates quantities rather than trusting a saved estimate.
The existing integration already delegates validation this way; this PR does not edit integration.ts or checkpoints.
The merge coordinator should run the combined suite after integrating tickets03, 04, and 06.

Structured currency, price basis, supply requirements, capacity, and date-specific availability are absent from the shared candidate contract.
A future coordinated contract change should add monetary evidence with amountMinor, currency, basis, provenance, sourceUrl, and retrievedAt, plus explicit supply requirement mapping and required-cost components.
That would replace the narrow generated-note parser and enable verified event totals without guessing semantics.
The proposal was sent to the chief; no shared contracts or supplier adapters were changed here.
