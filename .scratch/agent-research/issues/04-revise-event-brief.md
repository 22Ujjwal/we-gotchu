# 04: Update research when the customer changes their brief

**What to build:** The customer supplies missing information or changes requirements and receives research for the current brief without losing prior answers or seeing older results replace newer ones.

**Blocked by:** 01: Research a complete brief using real sources.

**Status:** implemented in independent branch; cross-ticket integration pending

- [x] Carry answered requirements into the next submission and ask only for still-missing essential information.
- [ ] Changes to location, quantity, or budget affect discovery, filtering, or ranking rather than reusing incompatible recommendations.
- [x] Every outcome carries its brief revision and run identity, and superseded outcomes are distinguishable to application consumers.
- [x] Verify the existing conditional publication rule at the migrated application storage boundary and report lifecycle dependencies through the chief.
- [x] Controlled workflow tests submit successive briefs and out-of-order completions to prove retained answers, changed recommendations, and stale-result rejection.
- [x] Verify stale-write rejection through application handlers and migrated test storage; frontend implementation stays with Leo.

## Implementation evidence

See [the ticket04 handoff](../../../docs/research/ticket04-brief-revisions.md) for baseline acceptance, reproduced failures, controlled tests, and integration limits.
The handler now rejects array patches and conditions its post-cleanup status write on the matching brief revision.
Location and guest-count changes produce new discovery requests under controlled HTTP.
Budget forwarding is verified; budget and quantity ranking policy remains ticket03 work.
Ticket06 must assess delayed initialization of an already superseded checkpoint.
No live application or provider behavior is claimed.
