# 06: Recover interrupted research without duplicating work

**What to build:** Interrupted research resumes from saved state, preserving useful results and progress without creating duplicate provider sessions or falsely declaring success.

**Blocked by:** 05: Expose research progress and cancellation through the application contract.

**Status:** implemented locally; central review and live recovery validation pending

- [x] Recover using durable session identity and the last fully processed sequence rather than ordering by event timestamps.
- [x] Replayed or repeated events do not duplicate application updates, and processing checkpoints never skip unprocessed outcomes.
- [x] Record uncertain session-creation outcomes and reconcile with a stable idempotency identity before retrying; do not blindly create another session.
- [x] Forced disconnect, process interruption, degraded sources, and exhausted bounds produce supported recovery or an actionable partial or failed outcome.
- [x] Recovery preserves cancellation decisions and the current brief revision so it cannot restart canceled work or publish a superseded result.
- [x] Controlled workflow tests inject disconnects, repeated sequences, uncertain creates, and interruption around checkpoint writes.
- [ ] Run a separate bounded live recovery check before claiming live recovery support; ordinary stream replay evidence alone does not prove crash recovery.
- [x] Keep supplier execution and approval resumption outside this research ticket; record live limitations and clean up evaluation resources.

## Handoff

See [interrupted research recovery](../../../docs/research/interrupted-research-recovery.md) for persisted restart evidence, provider contract limits, and cross-ticket integration.
Uncertain creates retain their stable operation identity and require reconciliation; automatic create replay is deliberately unsupported.
No live recovery, deployment, supplier execution, or approval resumption was verified.
