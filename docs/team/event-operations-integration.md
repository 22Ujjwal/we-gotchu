# Event operations integration handoff

Owner: Ujjwal. Availability: local branch `feat/event-operations`, not pushed, merged, or deployed. Implemented milestones and verification are recorded in the owner status. This file describes interfaces, not permission to change Tony's integration.

Run `bun scripts/event-operations-demo.ts` for a deterministic offline example. It uses a fixed clock and simulated fixtures, prints recovery/invitation/recurrence outputs, and performs no provider or database calls. Production routes do not import these modules yet.

## Integration boundary

Tony retains schema, migrations, database client, package manifest and lockfile until handback. No conversation, frontend, research, supplier, or existing transaction contract is modified by these modules. Internal types under `src/server/operations` are proposals for integration, not a new shared-contract version.

## Save my party

`previewRecovery` in `src/server/operations/recovery.ts` accepts an authorized current `EventView`, `expectedBriefRevision`, `expectedPlanRevision`, and a disruption with `unavailableActionIds` and/or a new `headcount`. Optional candidates are research leads in the event's currency. It returns a revised research brief, affected/preserved actions, actions needing reconciliation, candidate cost information, and `requiresFreshApproval: true`.

The preview is pure: it does not cancel, hold execution, start research, create a new plan/revision, refund, or change approvals. Existing ongoing execution is not paused merely by creating this preview. Before exposing it to a customer, load the event using the signed-in owner and recheck revisions under the event lock when a real recovery workflow starts. An explicit recovery hold and a transition out of booked/executing need an agreed transaction design; do not reuse the cancellation flag as a temporary hold because existing cancellation processing has actual side effects. Candidate comparisons retain the complete detached candidate, including simulation labels, source URLs, retrieval dates, verification and price provenance.

Pending, running, unknown and succeeded affected attempts are conservatively flagged for reconciliation/cancellation review. Independent read-only replacement research may still proceed, but no replacement commitment follows from this output. Unknown retained cancellation charges stay unknown. A lead is never a confirmed reservation.

## Invitations and recurring events

### Invitation interface

`prepareInvitation(input, now)` accepts provider (`luma` or `partiful`), title/description, explicit `startAt`/`endAt`, IANA timezone, optional `publishAt`, and either a confirmed address or `{confirmed:false}`. It returns content and `due`, `future`, or `expired`. The host's event times are unchanged. `createLumaInvitation(prepared, key, fetcher, clock?)` performs one explicit create request only when a fresh clock check says due. The caller must supply the calendar key securely; no environment wiring or customer route invokes this adapter yet.

Luma creation is private/free and disables reminders/feedback mail; no guest invitations are sent. The documented create receipt may contain only an ID, so `url:null` means a provider lookup is still needed; never synthesize a confirmed event link. Network/5xx/malformed receipts are unknown outcomes, not permission to create again. Partiful preparation returns the manual create-page handoff rather than a claimed published event. A future state is not proof that a background task has been scheduled.

### Recurrence interface

`generateOccurrences(series, now)` returns `occurrences` and local-time `issues`. A `Series` has an ID, IANA timezone, local `HH:mm`, start date, optional end date, weekly weekday (Sunday=0) or monthly day-of-month (1..31), preparation lead hours, horizon days, maximum count, optional pause/skipped dates, and a brief template without its date/timezone. The horizon is inclusive local calendar days (today through today+N), at most 366 days ahead; results are capped at 52. Lead time is elapsed hours, capped at 8784.

Each occurrence supplies a stable `seriesId:localDate` key, local date, `dueAt` preparation time, and a fresh brief with its UTC start timestamp/timezone, `requiresResearch:true` and `requiresApproval:true`. The helper excludes past starts but may return a past dueAt for an upcoming occurrence; the scheduler must decide catch-up policy explicitly. Day 31 skips months without that day. DST gaps/folds produce issues requiring host resolution; monthly first/last-weekday patterns are not included in this first version.

### Durable scheduling requirements

Recurring occurrence generation and invitation due-state calculation are decisions, not a background scheduler. Integrate only after agreeing on one authoritative storage model. Persist series configuration/revision, occurrence identities, invitation content revision, publish time, provider IDs and an operation state. A unique claim must prevent two workers from publishing the same occurrence. Recover expired claims carefully: an ambiguous provider POST requires lookup/reconciliation, not blind retry. Host edits, cancellation, pause and skip must be rechecked before dispatch.

Every occurrence needs fresh research and fresh approval/payment for changed commitments. Reuse preferences and brief answers, never prior approvals, payment IDs, booking references or claims of current availability. Guest RSVP data does not drive the schedule.

## External setup

Luma API creation requires Luma Plus and a calendar-scoped key. No account purchase, credential upload, event publication or guest notification is performed by this development work. Official references: https://docs.luma.com/reference/getting-started-with-your-api and https://docs.luma.com/reference/post_v1-events-create.

No official public Partiful API was verified. The supported first increment is a manual handoff to https://partiful.com/create with prepared content. Browser automation and a verified created link are future provider work; a handoff link is not an event link.

## What we need from Tony after handback

Confirm where conversation intents can call these helpers and which owner will add persistent series/invitation records. Agree recovery execution-hold semantics before connecting recovery to transactions. Provide the existing conversation API shapes so UI integration can preserve Leo's design. No credentials should be sent in chat.
