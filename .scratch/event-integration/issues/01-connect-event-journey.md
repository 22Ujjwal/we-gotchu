# Connect and verify the existing event journey

Type: implementation
Status: ready-for-agent
Label: ready-for-agent
Owner: Tony.
Assignee: unclaimed.
Blocked by: no outstanding research implementation ticket; live verification needs a configured deployment and test access.
Spec: [Connect the event interface to the working backend](../../specs/event-ui-integration.md).

## What to build

Connect the existing frontend to the existing authenticated customer event API while preserving Leo's design.
Replace sample event state and simulated success navigation with persisted EventView data, revision-safe updates, progress polling, exact-plan approval, Checkout restoration, and truthful cancellation/refund states.
Claim this ticket before implementation and coordinate cross-owned edits.

## Acceptance criteria

- A signed-in host creates an event from real input and restores the same persisted event after reload.
- Missing fields and errors preserve entered answers; inaccessible events do not leak data.
- Brief changes carry the expected revision; stale responses cannot replace current results.
- Progress entries are ordered and deduplicated, and polling stops when the event or identity changes.
- Partial research, listing estimates, unknown costs, and absent Plans remain visibly unconfirmed and non-bookable.
- Approval submits the displayed Plan identity and revision, and uses backend Checkout rather than fixture payment state.
- Checkout return alone never renders paid or booked; payment and supplier evidence determine the display.
- Cancellation requested, confirmed, partial, unknown, refund pending, and refund complete remain distinct.
- The rendered journey passes controlled HTTP tests for happy paths, reload, stale responses, uncertain writes, and cancellation races without real purchases.
- Keyboard and mobile flows remain usable, with meaningful labels, errors, focus, and status announcements.
- Existing application and coordination tests, typecheck, and build pass on the final combined head.
- A separate evidence record identifies the deployed commit and results of real sign-in and research testing, or names the exact environmental blocker.
A blocked live check must not be reported as a completed live acceptance test.

## Delivery and limits

Implement in incremental tested commits with one integration PR and a reviewable test record.
Do not edit other owners' status files or silently change shared contracts, root configuration, or provider behavior.
Live payments, external communication, and supplier commitments require separate authorized test conditions.
This ticket connects existing capabilities; it does not certify untested live booking or recovery.
