# 05: Expose research progress and cancellation through the application contract

**What to build:** Application consumers can follow research progress, inspect its outcome, and stop further research without implying any supplier transaction was canceled.

**Blocked by:** 01: Research a complete brief using real sources. External prerequisite: Ujjwal provides the agreed application storage and integration boundary.

**Status:** ready-for-agent

- [ ] Expose running, awaiting-input, successful, partial, failed, and canceled research through the agreed shared contract with event, brief, and run identity.
- [ ] Provide ordered customer-safe progress and actionable outcome details without leaking provider credentials or raw private diagnostics.
- [ ] Persist provider session identity and the last fully processed sequence through Ujjwal's storage boundary; duplicate delivery does not duplicate visible progress.
- [ ] Inspect provider stop reason and validated output before declaring success; idle status or stream closure alone cannot mean completion.
- [ ] Cancellation stops scheduling new research calls and reconciles or reports in-flight outcomes without claiming supplier booking or purchase cancellation.
- [ ] Provide Leo with reviewed consumer fixtures for progress, missing fields, partial results, failure, and cancellation without implementing his interface.
- [ ] Controlled workflow tests verify ordered and duplicate progress, idle errors, partial results, and cancellation during an in-flight call.
- [ ] Verify the workflow through the real application integration boundary and record what is tested separately from simulated fixtures.

## Implementation handoff

The implementation is on branch t3/durable-research-sessions and requires Ujjwal's review before merge.
See src/agent/INTEGRATION.md for the bounded stages, private storage change, cancellation limits, setup, and affected consumers.
Consumer examples for Leo are in src/agent/integration.fixtures.ts.
Application-handler tests use migrated database storage and controlled providers, including controlled HTTP responses for the real REST adapters.
This is not a live deployment check or ticket06 crash-recovery completion.
The current evidence validator intentionally returns partial research rather than inventing bookable plans.
