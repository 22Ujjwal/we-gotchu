# 04: Update research when the customer changes their brief

**What to build:** The customer supplies missing information or changes requirements and receives research for the current brief without losing prior answers or seeing older results replace newer ones.

**Blocked by:** 01: Research a complete brief using real sources.

**Status:** ready-for-agent

- [ ] Carry answered requirements into the next submission and ask only for still-missing essential information.
- [ ] Changes to location, quantity, or budget affect discovery, filtering, or ranking rather than reusing incompatible recommendations.
- [ ] Every outcome carries its brief revision and run identity, and superseded outcomes are distinguishable to application consumers.
- [ ] Coordinate the conditional publication rule with Ujjwal so an older run cannot overwrite a newer brief result at the storage boundary; an in-memory check alone is insufficient.
- [ ] Controlled workflow tests submit successive briefs and out-of-order completions to prove retained answers, changed recommendations, and stale-result rejection.
- [ ] Verify the stale-write rule against the application storage integration when available and mark it unverified until that check passes; frontend implementation stays with Leo.
