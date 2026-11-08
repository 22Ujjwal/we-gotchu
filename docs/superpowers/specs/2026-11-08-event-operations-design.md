# Event operations: recovery, invitations, recurring events

Owner: Ujjwal. User approved these three directions and execution in chat. First increment is independently runnable backend logic; hosted storage, scheduler and conversation/UI wiring await Tony's integration handback.

## Intent

Save my party proposes recovery after a host reports disruption. Invitation preparation uses the host's fixed event time, with an optional publication time. Recurring events preserve the standing brief while requiring new research and purchase approval per occurrence. Attendee availability never changes the schedule.

## Approaches

1. Extend the existing conversation/database now: most direct full product, conflicts with Tony's explicit ownership freeze.
2. Build isolated backend modules and a runnable offline scenario, then integrate through agreed interfaces: selected for this increment because it preserves ongoing work and exposes testable behavior.
3. Add a second app/database/worker: rejected because duplicate state and deployment add risk and maintenance.

## Global constraints

- Do not edit schema.ts, database migrations, db/client.ts, package.json, bun.lock, frontend, src/agent or src/suppliers.
- No existing transaction schema or approval/payment/cancel behavior changes.
- No real purchases, suppliers, guest messages, provider page publication or new subscriptions during development.
- No durable scheduling claims without a deployed scheduler and transactional claims. No production in-memory job store.
- All new types are internal to src/server/operations, not a published shared-contract version.

## Recovery

Consume an existing EventView plus host-reported unavailable action IDs or revised headcount. Validate current event/plan revisions and IDs; canceled events cannot be recovered by this preview. Identify directly affected actions and transitive dependents, preserve unrelated actions, and distinguish actions needing reconciliation from safe research. A proposal never cancels, approves, spends, claims refunds, or mutates the event. Provide the updated research brief and explicit fresh-approval requirement. Compare optional replacement candidates with honest known/unknown cost information; keep estimated replacement spend separate from unknown retained cancellation charges. No candidate is a confirmed reservation.

## Invitations

Validate title, description, explicit start/end timestamps, timezone, host-set optional publishAt, and confirmed/unconfirmed location. Produce provider-independent invitation content and a scheduling decision (due/future/expired); never publish after event start. Unknown venue becomes location pending. Luma payload targets the documented create endpoint, private visibility, free registration, no attendee sending. Partiful yields a clearly labeled manual handoff to its official create page; no invented API. Luma submission adapter accepts explicit account key and injected fetch, never retries ambiguous POST failures automatically, returns unknown outcome for ambiguous failures and validates the returned provider ID/link. It is not wired into a scheduler or exposed customer route in this increment. Live credentials are not required for tests.

## Recurrence

Support weekly and monthly-by-day-of-month schedules with local HH:mm time, IANA timezone, start/end dates, preparation lead time, pause and skipped local dates. Preserve wall-clock time across DST, report nonexistent/ambiguous times for host resolution rather than silently shifting. Skip nonexistent monthly dates, bound generation, stable occurrence identities include series ID and local date. Each result has a fresh brief and requires new research/approval; no copied approval/payment/plan/provider references. No autonomous job starts yet.

## Runnable result and handoff

A no-network Bun script demonstrates unavailable venue recovery, a prepared fixed-time invite, and upcoming repeated-event briefs using labeled fixtures. A separate integration document tells Tony which exports to call, storage/claim needs, owner checks, revision checks and provider prerequisites. Luma Plus/API access and Partiful automation remain unverified. Publish a draft PR for isolated modules; do not deploy or merge new shared wiring during Tony's freeze.
