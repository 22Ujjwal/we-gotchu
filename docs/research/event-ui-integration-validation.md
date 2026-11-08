# Event UI integration validation

## Current evidence

The fixture stage starts from the shared API client branch at `dc452f3` and merges the owner's DOM prerequisite `04bca45050f9c82bb5faab3fa0501d5fcaefefab`.
This session changes only the assigned test fixtures, journey tests, and this validation record.
No production screen, hook, backend, contract, configuration, or shared fixture was edited.

`src/lib/hostwell/event-view.test-fixtures.ts` exports `createEventViewFixture` with optional event ID, customer ID, and brief revision.
It returns isolated complete EventViews for running, partial, failed, missing-input, plan-ready, awaiting-payment, booked, canceling, refund-pending, and refund-completed states.
It reuses the shared plan-ready, booked, and cancellation examples and wraps the research-only examples in full event responses.
The builder preserves simulated evidence and does not import into production code.
The pending Checkout fixture contains no successful payment or supplier attempts.
The completed-refund fixture records an explicit succeeded refund independently of cancellation.

Thirteen tests validate the schemas, matching event/run/revision identities, plan/approval/action references, absence of payment evidence during research, distinct refund states, and independent fixture copies.
These are fixture checks running in the DOM project, not proof that a connected screen renders correctly.
Bun 1.4.4 frozen install, the focused fixture suite, typecheck, and production build pass at fixture commit `814d69d`.
The build warns that `src/routes/connected-journey.test.tsx` does not export a Route and excludes it from the route tree.
No root configuration change was made to suppress the warning.
The full combined suite and rendered acceptance checks remain pending production integration.

## Agreed rendered test boundary

Import the actual `EventPage` export from `src/components/hostwell/event-page.tsx`.
Pass its supported `eventId`, `identity`, and optional `onCheckout` props.
Keep the real `useEventSession` and customer API client in the test.
Mock only customer fetch responses, reject unexpected requests, and change the identity prop to represent sign-in, sign-out, and account replacement.
The checkout callback records the returned URL without navigating to an external payment service.
Do not mock the session hook or create a substitute event component.

Import the actual `BriefIntake` export from `src/components/hostwell/brief-intake.tsx`.
Pass `identity` and `onCreated` through its supported interface.
Use labels and keyboard interaction to enter an explicit date/time with offset, IANA timezone, and ISO currency.
Assert the actual POST body and preserve entered values after validation failures.
Do not accept an inferred timezone, date, currency, or fallback brief as successful intake.

## Scenarios to implement after the production commits arrive

- Restore the same event after unmount and remount, using the stored brief rather than local fixture state.
- Advance slow controlled research reads without overlapping polls, show ordered deduplicated progress, and reject older responses after an event or revision changes.
- Preserve unsent edits after a revision conflict while fetching the current server state.
- Show failed, missing-input, and partial outcomes without enabling approval when no Plan exists.
- Submit exactly the displayed plan ID and revision once, record only the backend Checkout URL, and keep payment pending until a later authoritative response confirms it.
- Restore a checkout-return event without treating navigation as payment or supplier confirmation.
- Distinguish requested cancellation, confirmed cancellation, pending refund, and completed refund using the supplied records.
- Clear the prior customer's data on identity replacement or sign-out, including when an older request completes late.
- Preserve draft answers after missing-field and uncertain-write errors, with no automatic write retry.

Assertions will target visible roles, labels, status text, retained form values, and outgoing HTTP request meaning.
The production screen and hook commits must be delivered before those tests can be implemented honestly.
The chief integrates the exact fixture and test commits into one combined feature branch and publishes its PR.
This independent session will not push, open its own PR, or merge the combined feature.

## Limits

Controlled fetch and identity props do not verify Clerk sign-in, server authorization, deployed routing, hosted research, payment processing, supplier execution, or live recovery.
JSDOM does not establish mobile layout, real browser focus behavior, or visual correctness.
Those checks require separate evidence against the intended environment and deployed commit.
No live endpoints, credentials, purchases, or external messages are used by this suite.
