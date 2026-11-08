# 03: Recommend options with defensible quantities and costs

**What to build:** The customer receives ranked venue and supply recommendations with explained tradeoffs, adequate quantities, and evidence-based budget conclusions.

**Blocked by:** 02: Investigate supplier details beyond search listings.

**Status:** ready-for-agent

- [ ] Rank candidates against the actual brief and explain matched constraints, unmet constraints, and unchecked constraints without forcing a fixed option count.
- [ ] Calculate indivisible supply packs before costs; twenty units in eight-unit packs require three packs.
- [ ] Distinguish verified quotes, estimates, known subtotals, and unknown taxes or delivery costs; compare compatible currencies and keep application minor units separate from provider usage units.
- [ ] Report budget fit as within, over, or unknown with supporting evidence; missing required costs prevent within, while a known subtotal above budget can establish over.
- [ ] Choose and document evidence freshness thresholds by evidence type; stale evidence cannot support a current verified claim without revalidation.
- [ ] Preserve source references, cancellation provenance, and relevant affiliate disclosures in the consumer result.
- [ ] Use real retrieval for sample-event demonstrations; truly simulated fallback evidence remains identifiable and cannot be presented as live research.
- [ ] Controlled workflow tests cover pack rounding, unknown costs, over-budget subtotals, currency mismatch, stale evidence, ranking changes, and unsupported model conclusions.
