# 06: Recover interrupted research without duplicating work

**What to build:** Interrupted research resumes from saved state, preserving useful results and progress without creating duplicate provider sessions or falsely declaring success.

**Blocked by:** 05: Expose research progress and cancellation through the application contract.

**Status:** ready-for-agent

- [ ] Recover using durable session identity and the last fully processed sequence rather than ordering by event timestamps.
- [ ] Replayed or repeated events do not duplicate application updates, and processing checkpoints never skip unprocessed outcomes.
- [ ] Record uncertain session-creation outcomes and reconcile with a stable idempotency identity before retrying; do not blindly create another session.
- [ ] Forced disconnect, process interruption, degraded sources, and exhausted bounds produce supported recovery or an actionable partial or failed outcome.
- [ ] Recovery preserves cancellation decisions and the current brief revision so it cannot restart canceled work or publish a superseded result.
- [ ] Controlled workflow tests inject disconnects, repeated sequences, uncertain creates, and interruption around checkpoint writes.
- [ ] Run a separate bounded live recovery check before claiming live recovery support; ordinary stream replay evidence alone does not prove crash recovery.
- [ ] Keep supplier execution and approval resumption outside this research ticket; record live limitations and clean up evaluation resources.
