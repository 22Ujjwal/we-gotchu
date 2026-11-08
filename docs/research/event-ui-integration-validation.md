# Event UI integration validation

## Implementation and test boundary

The fixture stage starts from the shared API client branch at `dc452f3` and merges the owner's DOM prerequisite `04bca45050f9c82bb5faab3fa0501d5fcaefefab`.
The journey branch then adopts the delivered API/session, screen, and generated-route commits, including the access-loss polling, retained-conflict-error, saved-timezone, and keyboard-focus follow-ups.
This session authors only the assigned test fixtures, journey tests, and this validation record.
It does not independently edit production screens, hooks, backend code, contracts, configuration, or shared fixtures.

`src/lib/hostwell/event-view.test-fixtures.ts` exports `createEventViewFixture` with optional event ID, customer ID, and brief revision.
It returns isolated complete EventViews for running, partial, failed, missing-input, plan-ready, awaiting-payment, booked, canceling, refund-pending, and refund-completed states.
It reuses the shared complete examples and wraps the research-only examples with matching event/run/revision identities.
The builder preserves simulated evidence and is not imported by production code.
The pending Checkout fixture contains no successful payment or supplier attempts.
The completed-refund fixture records a succeeded refund independently of cancellation.

`src/routes/-connected-journey.test.tsx` contains thirteen fixture checks and twenty-four rendered journey checks.
The authorized filename prefix excludes the test from route discovery without a configuration change.
The tests render the actual EventPage, ConnectedEventPage, and BriefIntake exports with the real session hook and customer API client.
Only customer fetch and Clerk useUser are mocked.
No substitute screen, hook mock, or backend implementation is used.
The checkout callback records the returned URL without navigating to an external payment service.

## Verified scenarios

- Complete fixtures validate schema and cross-record event, run, revision, plan, approval, and action identities.
- A remounted connected screen restores the persisted event brief through a fresh customer GET.
- Partial, failed, and missing-input research display their evidence and never offer approval without a Plan.
- Approval sends the displayed plan ID and revision once despite repeated clicks, then uses only the backend Checkout URL.
- A restored event with checkout=success still displays pending payment and no supplier confirmation until authoritative evidence changes.
- Cancellation requested, event canceled, refund pending, and refund succeeded remain separate visible states.
- Clerk account replacement and sign-out clear private event data, reject an earlier account's late response, and stop old polling.
- Changing event links rejects an older event's late response.
- A controlled slow poll cannot overlap another read, uses the application progress cursor, and renders ordered deduplicated entries.
- A revised brief wins over an older in-flight research response.
- A 409 edit conflict restores current server state while retaining typed answers and conflict feedback.
- Keyboard intake submits the explicit date, UTC offset, IANA timezone, ISO currency, amounts, and supply needs without guessed defaults.
- Ambiguous dates, absent UTC offsets, invalid zones, and invalid currencies produce focused errors before any request.
- A lost create response retains answers and blocks repeated creation.
- Missing-field server errors preserve earlier intake answers for correction.
- HTTP 401, 403, and 404 clear private data, focus the error, and stop automatic reads.
- A temporary read failure retains saved evidence and reconnects with GET requests only.
- Mixed supplier outcomes show paid status separately from one confirmed commitment and one unknown commitment.
- After unmounting for more than the default research deadline, the restored screen displays the server's terminal failure without automatically creating another run or claiming cancellation.

Assertions target visible roles, labels, status text, retained form values, focus, and outgoing HTTP request meaning.
The deadline test supplies a controlled expired server response; it does not retest the backend timer or claim a browser can advance research while closed.
No production failure was found by these rendered checks on the delivered implementation.

## Reproduction and handoff

Use Bun 1.4.4 and `bun install --frozen-lockfile` with the unchanged owner-provided lockfile.
Run `bun run test --project dom src/routes/-connected-journey.test.tsx` for the 37 focused checks.
Run `bun run test --maxWorkers 2`, `bun run typecheck`, `bun run build`, and `node --test tools/team-coordination/*.test.mjs` for combined verification.
The final session handoff records the exact tested HEAD and totals.

The authored rendered-test commits are `ecdfe35`, `c242cbe`, `efff822`, and `8ccd39c` in that order.
They follow the already delivered fixture commits and authorized test-file rename.
The chief integrates these exact commits into the combined feature branch and reruns its checks before handing that final HEAD to the user for separate review.
This independent session does not push, open a separate PR, or merge the feature.

## Limits

Controlled fetch and identity boundaries do not verify real Clerk sign-in, server authorization, deployed routing, hosted research, payment processing, supplier execution, or live recovery.
The tests assert component behavior on a checkout-return URL but do not exercise a live redirect or the route's hosted deployment.
JSDOM verifies the tested focus and keyboard interactions, but does not establish mobile layout, browser visual correctness, or reduced-motion rendering.
Those checks require separate evidence against the intended environment and deployed commit.
No live endpoints, credentials, purchases, supplier contacts, or external messages are used by this suite.

## Integration review corrections

The combined implementation review reproduced a duplicate-create risk after a malformed HTTP 201 response.
Both truncated JSON and structurally invalid successful responses now lock creation while retaining input.
The review also reproduced a stale editor silently using a newer polled brief revision.
The editor now retains its original brief revision and passes it explicitly to the session update method.
A conflict retains typed answers and the original revision even after automatic reconciliation.
Closing the editor and reopening it loads the current brief for a deliberate new edit.
Focused regression tests failed before the fixes and passed afterward.
These checks remain controlled HTTP component tests, not live deployment evidence.
