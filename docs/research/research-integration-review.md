# Research integration review ledger

PR: https://github.com/22Ujjwal/we-gotchu/pull/24.
Reviewed head: cb6f52244edb0bc72dedb53540a0d8c99dbb07b0.
Review: https://github.com/22Ujjwal/we-gotchu/pull/24#pullrequestreview-5816228416.
All 18 inline comments were fetched from GitHub before fixes.
Nine application-boundary regressions failed on the reviewed implementation before the core fixes.
The separate configuration regression also failed before its fix.
The partial Sol review's open S1 matches comment 4504742311; it was incomplete and is not approval.

## Dispositions

| Comment ID | Disposition and evidence |
| --- | --- |
| 4504742311 | Fixed in 1677b35. Cancellation takes Run identity and loads its checkpoint before a session exists. PGlite handler tests cover cancel and brief replacement after definition creation, plus an unconfirmed deletion retained for retry. This also addresses Sol S1. |
| 4504742312 | Fixed in 1677b35. Cleanup tracks each resource, skips confirmed work, and never downgrades confirmation for the same identity. Tests cover brief replacement after completion, retry after failure, and a late failed cleanup record. |
| 4504742313 | Fixed in 1677b35. A status GET no longer gates stop or deletion. The typed client accepts only the documented terminal conflict or absent-definition code; other failures remain unresolved. Tests cover failed reads and rejected nonterminal errors. |
| 4504742314 | Fixed in 1677b35. Missing checkpoints return a visible failed result with restart instructions. Legacy simulated IDs never reach the real provider. A PGlite handler regression proves termination. |
| 4504742315 | Fixed in a31a1f5. Configuration is checked before event creation or brief replacement; missing configuration returns 503 research_not_configured. .env.example lists all research variables. A regression proves no event or unknown run is created. |
| 4504742318 | Fixed in 1677b35. The final sequence is stored atomically during result publication before the lease is cleared. A simulated port against PGlite retains sequence 1. Test-store behavior now matches the production fences. |
| 4504742321 | Fixed in 1677b35. Revalidated result warnings are deduplicated. A boundary test exercises enrichment and proves uniqueness. |
| 4504742324 | Fixed in 1677b35. Uncertain state is handled before the deadline branch. An expired uncertain checkpoint retains its reconciliation warning in the final result. |
| 4504742327 | Fixed in 1677b35. Cleanup uses the idempotent stop operation and handles the documented terminal conflict, so a stale running snapshot cannot create a false failure. Other conflicts remain errors. |
| 4504742330 | Fixed in 1677b35. Only hosted creation/correction stages become uncertain. Discovery/detail failures preserve evidence and report source failure. A read-only enrichment regression checks that no resource-reconciliation claim is invented. |
| 4504742331 | Fixed in 34cdbf4 after adopting PR25 head 4148d55. ResearchProviders['enrich'] and investigating are canonical. The configured path wires the real detail adapter and uses rankingCandidates. Combined controlled HTTP tests cover all adapters. |
| 4504742334 | Addressed with a smaller change in 38a825f and 34cdbf4. Checkpoint fields reuse Run types and reads use authoritative Run columns. The canSendCorrection rule is reused. Snapshot mirrors remain because they are written atomically with the versioned workflow state. Calling recordCorrection separately would split the claim from that transaction, so that suggestion is declined. |
| 4504742335 | Fixed in 3030913. The standalone ranker now uses the same bounded session client as the durable integration. One set of endpoint schemas, budget constants, and cleanup error semantics remains. Existing standalone adapter tests and application tests pass. |
| 4504742339 | Addressed with a smaller change in 38a825f. Private checkpoint types moved to the server storage layer; database modules no longer import agent checkpoint internals. The integration consumes only checkpoint storage and progress writing. The existing dependency composition root still constructs ResearchPort; moving that wiring adds no consumer benefit and is declined. |
| 4504742342 | Addressed using the review's test-only alternative in fea9c01. Examples were renamed integration.test-fixtures.ts and only tests import them. No frontend import exists. Promotion into shared browser fixtures is deferred until a consumer requires it and Ujjwal coordinates that addition. |
| 4504742343 | Fixed in the handoff documentation. The claimed ownership exception was removed. Ujjwal's review remains pending; authorization to implement fixes is not recorded as owner approval. |
| 4504742345 | Addressed by the standalone PR26 dependency. Exact commit 60e20a03cc2cb9bf10782ab905e39d23836d2485 is in branch ancestry. There is no route-file delta relative to the adopted PR25 dependency, which also contains PR26. The earlier identical repair remains historical and is not a separate delivered route change. |
| 4504742347 | Fixed in the handoff documentation. The standalone README points to INTEGRATION.md, and Tony's status separates merged standalone work from on-branch application integration and historical live evidence. |

## Verification and remaining review

The combined configured-path regression calls application handlers against migrated PGlite storage and real discovery, detail, and hosted-session adapters with controlled HTTP responses.
It verifies detail provenance, hostile-note exclusion from ranking input, one correction, cleanup, and unknown final costs without a bookable plan.
Additional tests cover cooperative detail abort, monotonic cleanup, stale publication, legacy runs, and finite request work.
No live application or hosted-service mutation was performed during these review fixes.

Exact final HEAD, full-suite count, typecheck/build results, and GitHub checks are recorded in the PR body and coordinator handoff after the final commit.
The dependency order is PR26, PR25, then PR24.
Ujjwal's review remains required for storage, migration, interfaces, configuration, and wiring.
No owner approval is fabricated, and no PR merge is performed by this session.
Copilot reported exhausted review quota; that is not approval and automated monitoring is not restarted for it.
Full crash recovery and unknown-resource discovery remain ticket06.
