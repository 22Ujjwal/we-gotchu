# 01: Deliver a useful proposal with one planner

**What to build:** A customer submits a natural-language event brief and receives useful, sourced venue and supply options in the existing planning chat from one hosted planner.
Reuse the existing conversation API, storage and interface, preserving the current design.
Use native public research initially and preserve the existing team configuration for later comparison.
This approved milestone replaces the earlier requirement for direct Monid calls and required specialist delegation; neither is an acceptance prerequisite here.
Do not introduce another orchestration framework or retire the older event flow during this slice.

**Blocked by:** None (can start immediately).

**Status:** in-progress

Owner: Tony.

- [ ] One configured planner researches and returns proposals without required specialist delegation or repeated customer approval for routine public research.
- [ ] Two materially different complete briefs run through the same implementation without hardcoded answers.
- [ ] Each live run targets a customer-visible useful proposal within 90 seconds of submission; record actual elapsed time and report a miss honestly.
- [ ] Options include relevant venue and supply choices, working source links, and published prices or a specific next action for missing information.
- [ ] Manually check reported prices, pack contents, quantities and calculated subtotals against retrieved evidence; distinguish estimates from published facts and leave unknown totals unknown.
- [ ] Research stops when findings support the customer's next decision or missing facts require supplier contact, rather than endlessly expanding the shortlist.
- [ ] A failed or delayed provider call produces an understandable saved outcome or recoverable status; a timeout, empty answer or fixture is not a successful proposal.
- [ ] Verify the live SDK path before spending time on a browser run; after it passes, verify submission and proposal rendering in the actual local desktop application with Terra.
- [ ] Record the exact code revision, configuration, brief, provider session, observed tool calls, timing, outcome and remaining limits without credentials.

## Verification approach

Tony approved real-run-first verification for this milestone, with no new automated tests by default.
Do not add a controlled-test stage before the first live proof.
If a real run exposes a bug, reproduce it, inspect its cause and consider a focused regression test where useful.
Use proportional existing checks after changes and the required existing suite before any later shipping step.
Keep spend within the existing configured allowance unless separately authorized.
Stop test-owned sessions and processes after collecting evidence.

## Scope limits

Keep all code local; no push, merge or deployment.
No supplier messages, reservations, purchases, payment changes, shared-status edits or removal of the existing team.
Monid is optional follow-up evidence work if native supply research proves inadequate, not a requirement to add another dependency now.
