# Event Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans to implement this plan task-by-task.

**Goal:** Deliver runnable, tested recovery/invitation/recurrence modules without disturbing Tony's integration.
**Architecture:** Pure decision modules with internal types; a separately injectable Luma HTTP adapter. Offline scenario exercises the modules. Durable runtime integration is explicitly pending the storage handback.
**Tech Stack:** Existing TypeScript, Zod, Bun, Vitest, Intl; no dependencies added.
**Spec:** docs/superpowers/specs/2026-11-08-event-operations-design.md

## Global Constraints

Preserve all frozen files and ownership boundaries in the spec. No real external writes. New files only under src/server/operations, scripts and docs. Small tested conventional commits, no coauthor attribution. User update: implement and test one milestone at a time; no remote push without fresh user permission. Order: recovery, invitations, recurrence, demonstration/handoff.

## Review Focus

- Recovery must reject stale/canceled event snapshots and never treat unknown supplier state as failed safely.
- Cost differences must not assume unknown cancellation charges are zero.
- Invitation timezone/time order and provider response must be validated; ambiguous creation cannot be retried blindly.
- DST gaps/folds, month-end, pause/skip and limits must not generate wrong or duplicate occurrences.
- Scenario and handoff must not claim scheduler, frontend or provider integration exists.

### Task 1: Recovery preview
Files: src/server/operations/recovery.ts and recovery.test.ts.
Interface: export previewRecovery(input), consuming EventView and disruption; return non-mutating affected/preserved/reconcile action IDs, research brief, candidate comparisons and approval requirement. Implementer documents exact type in handoff.
- [x] Write tests for unavailable venue + dependent supplies + unrelated action, unknown attempts, stale/canceled input, headcount revision, unknown costs and immutable input; run red.
- [x] Implement minimal preview with existing contracts; no writes or research calls.
- [x] Run focused tests/typecheck and commit only owned files.

### Task 2: Invitation preparation and Luma boundary
Files: src/server/operations/invitations.ts and invitations.test.ts.
Interface: export prepareInvitation(input, now) and createLumaInvitation(prepared, key, fetcher). Distinguish future/due/expired and Partiful manual handoff. No implicit sending or retries.
- [x] Write tests for fixed schedule, invalid times/timezone, pending venue, future/expired publication, exact Luma payload/response, rejected and ambiguous POST, Partiful handoff; run red.
- [x] Implement validation and provider adapter against official docs. No credential or network use in tests.
- [x] Run focused tests/typecheck and commit only owned files.

### Task 3: Recurring occurrences
Files: src/server/operations/recurrence.ts and recurrence.test.ts.
Interface: export generateOccurrences(series, now) returning bounded fresh occurrence briefs, due times, stable keys and DST issues. Internal Series type owns weekly/monthly configuration.
- [x] Write tests for weekly wall time across DST, gap/fold, monthly 31st, pause, skip, end date, limits, invalid input and preservation of unchanged brief; run red.
- [x] Implement using Intl with no new library; explicit issues for ambiguous/nonexistent times.
- [x] Run focused tests/typecheck and commit only owned files.

### Task 4: Demonstration and integration handoff
Files: scripts/event-operations-demo.ts, docs/team/event-operations-integration.md, docs/team/status/ujjwal.md.
- [x] Read all module exports and compose a deterministic no-network scenario with simulated fixture.
- [x] Run scenario and verify recovery scope, invitation state, and occurrence times by hand.
- [x] Review module boundaries and perform independent whole-branch review.
- [x] Run full application/coordination tests, typecheck, build, diff/frozen-file checks; record exact evidence.
- [x] Keep commits local; document pending storage, scheduled dispatch, UI, provider access and Tony's handback. Request permission before any remote push.
