# 05: Expose research progress and cancellation through the application contract

**What to build:** Application consumers can follow research progress, inspect its outcome, and stop further research without implying any supplier transaction was canceled.

**Blocked by:** 01: Research a complete brief using real sources. External prerequisite: Ujjwal provides the agreed application storage and integration boundary.

**Status:** implemented-on-branch; owner review pending

- [x] Expose running, awaiting-input, successful, partial, failed, and canceled research through the agreed shared contract with event, brief, and run identity.
- [x] Provide ordered customer-safe progress and actionable outcome details without leaking provider credentials or raw private diagnostics.
- [x] Persist provider session identity and the last fully processed sequence through Ujjwal's storage boundary; duplicate delivery does not duplicate visible progress.
- [x] Inspect provider stop reason and validated output before declaring success; idle status or stream closure alone cannot mean completion.
- [x] Cancellation stops scheduling new research calls and reconciles or reports in-flight outcomes without claiming supplier booking or purchase cancellation.
- [x] Provide Leo with reviewed consumer fixtures for progress, missing fields, partial results, failure, and cancellation without implementing his interface.
- [x] Controlled workflow tests verify ordered and duplicate progress, idle errors, partial results, and cancellation during an in-flight call.
- [x] Verify the workflow through the real application integration boundary and record what is tested separately from simulated fixtures.

## Implementation handoff

The implementation is on branch t3/durable-research-sessions and requires Ujjwal's review before merge.
See src/agent/INTEGRATION.md for the bounded stages, private storage change, cancellation limits, setup, and affected consumers.
Test-only contract examples for Leo to inspect are in src/agent/integration.test-fixtures.ts.
Application-handler tests use migrated database storage and controlled providers, including controlled HTTP responses for the real REST adapters.
This is not a live deployment check or ticket06 crash-recovery completion.
The current evidence validator intentionally returns partial research rather than inventing bookable plans.
Review dispositions are recorded in docs/research/research-integration-review.md.
Exact PR26 repair 60e20a0 and PR25 runtime 4148d55 are integrated as dependencies; owner review and PR merges remain pending.
