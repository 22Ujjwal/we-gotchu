# 02: Investigate supplier details beyond search listings

**What to build:** The customer receives supplier evidence investigated beyond search listings, with a record of what was checked and what remains unknown.

**Blocked by:** 01: Research a complete brief using real sources.

**Status:** ready-for-agent

- [ ] Investigate promising supplier detail pages or supported supplier APIs for capacity, price, pack size, delivery, and cancellation terms within configured bounds.
- [ ] Evaluate Apify Website Content Crawler, relevant supplier-specific Actors, direct APIs, and existing browser tools before implementing custom extraction; record why the chosen integration fits.
- [ ] Verify selected tools against representative suppliers and record returned and missing fields, authentication needs, latency, and observed failure behavior without exposing credentials.
- [ ] Preserve the source, observation time, and provenance of every extracted claim and distinguish supplier content from an actual quote.
- [ ] Record attempted checks and reasons for remaining unknowns, including absent content, access failures, and information requiring supplier contact; do not contact suppliers.
- [ ] Opening hours and price brackets never establish date-specific availability or a final event price.
- [ ] Controlled workflow tests prove that missing discovery fields can be filled from detail evidence and that absent or failed detail retrieval stays explicit.
- [ ] Expand the opt-in live smoke test to prove discovery and selected detail extraction work together on one representative brief, with bounded usage and cleanup.
