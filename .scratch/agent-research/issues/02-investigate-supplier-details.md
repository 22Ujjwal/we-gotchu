# 02: Investigate supplier details beyond search listings

**What to build:** The customer receives supplier evidence investigated beyond search listings, with a record of what was checked and what remains unknown.

**Blocked by:** 01: Research a complete brief using real sources.

**Status:** implemented on branch; PR25 remains unmerged and awaits owner review.

- [x] Investigate promising supplier detail pages or supported supplier APIs for capacity, price, pack size, delivery, and cancellation terms within configured bounds.
- [x] Evaluate Apify Website Content Crawler, relevant supplier-specific Actors, direct APIs, and existing browser tools before implementing custom extraction; record why the chosen integration fits.
- [x] Verify selected tools against representative suppliers and record returned and missing fields, authentication needs, latency, and observed failure behavior without exposing credentials.
- [x] Preserve the source, observation time, and provenance of every extracted claim and distinguish supplier content from an actual quote.
- [x] Record attempted checks and reasons for remaining unknowns, including absent content, access failures, and information requiring supplier contact; do not contact suppliers.
- [x] Opening hours and price brackets never establish date-specific availability or a final event price.
- [x] Controlled workflow tests prove that missing discovery fields can be filled from detail evidence and that absent or failed detail retrieval stays explicit.
- [x] Expand the opt-in live smoke test to prove discovery and selected detail extraction work together on one representative brief, with bounded usage and cleanup.


## Evidence and handoff

Implementation and review fixes are on `feat/supplier-detail-evidence` in [PR25](https://github.com/22Ujjwal/we-gotchu/pull/25).
[Supplier detail evidence](../../../docs/research/supplier-detail-evidence.md) records the bounded provider choice, live smoke, controlled regressions, and all seven review dispositions.
The live smoke at `6ceb165` passed with six recommendations and unknown total costs, availability, and cancellation.
Subsequent review fixes use controlled provider tests; no new live calls were made.
The exact shared route repair `60e20a0` from PR26 is included as a dependency, with no main merge.
PR24 owns integration README and shared Tony status wording, and receives the stable head and status text for combined verification.
Owner review remains pending; automated reviewer quota exhaustion is not approval.
