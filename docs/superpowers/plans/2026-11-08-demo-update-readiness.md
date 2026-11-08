# Demo update readiness

Preserve the existing planning, inquiry and payment models. No production configuration changes or live external actions in this increment.

1. Reproduce stopped reply polling. Add saved-only reads while arrangements wait and replies process; refresh on returning to the page. Verify no duplicate commands, overlapping reads, stale versions or account leaks.
2. Add a local, read-only configuration preflight. Report missing names separately for research, controlled mail, recovery and sandbox payment; never output values or claim live verification. Correct recovery documentation to reflect possible follow-up sends.
3. Inspect durable recovery for starvation and verify a minimal fix with offline tests if needed. Keep existing idempotency and controlled-recipient restrictions.
4. Run selected-offer/payment integration tests without providers. Document remaining live gates: approved recipient, attached company agent, reachable MCP/webhook and signed test-payment callback.
5. Review diffs, run focused tests/typecheck, commit each tested milestone independently. No merge.
