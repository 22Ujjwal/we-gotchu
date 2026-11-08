# 03: Recommend options with defensible quantities and costs

**What to build:** The customer receives ranked venue and supply recommendations with explained tradeoffs, adequate quantities, and evidence-based budget conclusions.

**Blocked by:** 02: Investigate supplier details beyond search listings.

**Status:** controlled implementation complete; live retrieval demonstration unverified

- [x] Rank candidates against the actual brief and explain matched constraints, unmet constraints, and unchecked constraints without forcing a fixed option count.
- [x] Calculate indivisible supply packs before costs; twenty units in eight-unit packs require three packs.
- [x] Distinguish verified quotes, estimates, known subtotals, and unknown taxes or delivery costs; compare compatible currencies and keep application minor units separate from provider usage units.
- [x] Report budget fit as within, over, or unknown with supporting evidence; missing required costs prevent within, while a known subtotal above budget can establish over.
- [x] Choose and document evidence freshness thresholds by evidence type; stale evidence cannot support a current verified claim without revalidation.
- [x] Preserve source references, cancellation provenance, and relevant affiliate disclosures in the consumer result.
- [ ] Use real retrieval for sample-event demonstrations; truly simulated fallback evidence remains identifiable and cannot be presented as live research.
- [x] Controlled workflow tests cover pack rounding, unknown costs, over-budget subtotals, currency mismatch, stale evidence, ranking changes, and unsupported model conclusions.

## Implementation handoff

See [defensible recommendation evidence](../../../docs/research/defensible-recommendations.md) for supported calculations, configurable freshness policy, and cross-ticket integration.
The controlled workflow calculates listing estimates with explicit quantity assumptions, not verified final event totals.
Current contracts do not provide enough structured evidence to report a within-budget event.
Real retrieval demonstration and deployment remain unverified.
