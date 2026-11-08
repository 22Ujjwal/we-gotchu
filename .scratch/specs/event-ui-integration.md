# Connect the event interface to the working backend

Type: spec
Status: open
Label: ready-for-agent
Owner: Tony, integration work with the existing frontend and backend.

## Problem Statement

The event screens currently use local sample data rather than the customer's persisted event.
Navigation can display booked or paid copy without backend evidence, and local state disappears after reload.
The frontend, customer APIs, and research implementation exist, but the customer journey has not been connected and verified end to end.

## Solution

Preserve the existing frontend design and connect it to authenticated event creation, restoration, brief updates, research progress, plan approval, Checkout, and cancellation.
Show backend evidence and clearly distinguish incomplete research, estimates, confirmed commitments, and uncertain outcomes.
Make the integrated journey testable with controlled API responses, then verify sign-in and real research on the deployment.
This is Tony's integration work, not a new frontend redesign assignment for Leo.

## User Stories

1. As a host, I want to sign in before accessing my event, so that my event remains private.
2. As a host, I want to submit my actual event brief, so that research reflects my requirements.
3. As a host, I want missing or invalid fields explained without losing my answers, so that I can correct them.
4. As a host, I want an event-specific link, so that I can reopen the same event after a reload.
5. As a host, I want my persisted brief restored, so that I do not have to re-enter it.
6. As a host, I want research progress and failures displayed, so that I know whether to wait or act.
7. As a host, I want to revise my brief without older results replacing the new answers, so that I see relevant options.
8. As a host, I want sources and recommendation reasons, so that I can assess the evidence.
9. As a host, I want unknown prices, availability, quantities, and cancellation terms identified, so that estimates do not look like guarantees.
10. As a host, I want partial and non-bookable results explained, so that I understand why approval is unavailable.
11. As a host, I want each option's currency and price basis shown, so that I can interpret the amount correctly.
12. As a host, I want the exact current Plan and its actions before approval, so that I understand what I authorize.
13. As a host, I want changed or expired plans to require fresh review, so that an old click cannot authorize new commitments.
14. As a host, I want Checkout to use the backend-issued payment flow, so that the interface cannot invent a payment.
15. As a host, I want payment status restored after returning from Checkout, so that a redirect alone is not treated as payment success.
16. As a host, I want confirmed supplier evidence for bookings, so that a successful payment is not mistaken for a reservation.
17. As a host, I want one event cancellation action with its consequences explained, so that I can stop research or request cancellation of commitments.
18. As a host, I want cancellation requested, cancellation confirmed, refund pending, and refund complete distinguished, so that I know what has actually happened.
19. As a host, I want each plan, action, and payment labeled with its declared mode and each candidate with its evidence mode, so that a demo cannot mislead me.
20. As a host, I want temporary connection failures handled without duplicate actions, so that reconnecting does not cause another purchase.
21. As a host, I want unknown recovery outcomes explained, so that I do not blindly retry an uncertain operation.
22. As a host using a keyboard or assistive technology, I want usable forms and understandable status announcements, so that I can complete the same journey.
23. As a host, I want switching accounts or events to clear the previous event's data, so that stale private information is not displayed.
24. As a team member, I want reproducible controlled tests and separately recorded live evidence, so that passing tests do not imply verified supplier execution.

## Implementation Decisions

- Preserve existing layouts, visual styling, components, and navigation intent while replacing fixture-backed event state with an authenticated EventView consumer.
Do not redesign screens or independently add frontend presentation elements.
If a required state has no existing presentation, stop that presentation change and give Tony a concrete prompt for Leo describing the missing state and backend evidence.
Continue independent API wiring and tests while waiting for the frontend decision.
- Use the existing customer HTTP API and shared contract 0.4 types and validation rules.
Do not add a second backend or make browser calls directly to supplier providers or MCP.
- Create an event with POST /api/events and restore it with GET /api/events/:id.
Keep event identity in a reloadable URL without embedding credentials or sensitive brief data.
Use /events/$eventId as the canonical event route, matching the backend Checkout return addresses /events/{eventId}?checkout=success and ?checkout=canceled.
This route does not exist at the baseline.
Tony explicitly authorizes the integration implementer to add this route adapter and wire the existing screens to the API without changing Leo's design.
Coordinate generated route updates through Ujjwal's existing route-generation tooling.
No event-list endpoint is assumed.
- Send partial brief changes to PATCH /api/events/:id/brief with expectedBriefRevision and changes.
Handle revision conflicts by fetching current state and preserving the user's unsent edits for review.
- Fetch a full EventView initially and after reload.
For subsequent progress reads, use afterSequence and merge entries by eventId and sequence while refreshing summary records.
The progress cursor is not the provider run cursor.
- Prevent overlapping polls, reject late responses from old events or revisions, stop polling on sign-out or unmount, and use bounded retry delays for transient reads.
GET /api/events/:id advances research through advanceRun; it is not a passive read.
The configured default research deadline is 120 seconds from run creation and continues while the tab is closed.
Without polls, no further application-driven step runs; an already in-flight operation may still finish.
Returning after the deadline can produce a terminal time-limit result, not an explicit customer cancellation.
Use a non-overlapping poll loop while research is active, scheduling the next read about one second after completion and backing off transient errors to at most five seconds.
Test the resulting cadence against controlled slow responses and the default deadline.
Do not promise background completion or restart research automatically when a tab returns.
This spec preserves the current backend limit; Ujjwal coordinates any change to deadline or background advancement, outside this integration ticket.
If the existing UI cannot explain the interruption, request the missing state from Leo before changing presentation.
Do not retry writes with uncertain outcomes automatically.
- Clear event data on identity changes and distinguish authentication, access denial, missing events, validation errors, and temporary failures.
Server authorization remains authoritative.
- Treat nullable records as absent, not as success.
ResearchResult is read-only evidence; approval requires an eligible current backend Plan.
Current real research may remain partial and produce no Plan.
- Render integer minor-unit money using its supplied currency.
Do not reuse sample VAT arithmetic or invent delivered totals, photos, capacity, dates, receipt lines, or verified supplier attributes.
Never populate unsupported details with fabricated data.
If the existing design cannot represent their absence, request Leo's frontend decision through Tony before changing the presentation.
- Show recommendation matched, unmet, and unchecked reasons, sources, warnings, freshness limitations, and listing-price provenance.
Do not combine incompatible currencies or turn unknown budget fit into within budget.
- Submit approval to POST /api/events/:id/approve with the displayed planId and planRevision.
Use the returned checkoutUrl; restore authoritative state on return.
Disable duplicate submissions, and never infer payment or booking success from clicks, navigation, or redirect parameters.
- Submit explicit customer cancellation to POST /api/events/:id/cancel.
Explain the current plan's cancellation terms and limits before commitment cancellation.
Render each attempt and refund state independently, including partial and unknown outcomes.
- Use explicit Plan, PlannedAction, and Payment mode fields and Candidate.evidenceMode.
Run and ResearchResult have no top-level mode field; do not infer one from session ID prefixes or source-tool names, or label an entire run live merely because a candidate is live.
If a run-level badge is required, request a separately reviewed contract change from Ujjwal; it is not required by this ticket.
- Keep fixture scenarios in controlled tests or explicitly labeled demo mode, separate from the authenticated live journey.
Do not add automatic uncertain-create replay or claim a live recovery guarantee.
- Coordinate any required contract, root dependency/configuration, or backend changes with their owner before editing.
Prefer adapting to existing supported behavior; record genuine missing API capabilities separately rather than inventing endpoints.

## Testing Decisions

- Use one primary test boundary: the rendered customer journey with controlled responses at the existing customer HTTP API.
Assert visible behavior and outgoing request meaning, not internal hooks or reducer structure.
- Reuse planReadyEvent, bookedEvent, and canceledEvent as complete EventView examples; canceledEvent represents a pending refund.
Research consumer examples are test-only ResearchResult values, plus an incomplete running-state example, not complete EventViews.
Wrap them in valid EventView records with matching event/run/revision identities, and construct full running and completed-refund examples for UI tests.
Do not import test-only research modules into production frontend code.
Existing application service, brief-revision, payment webhook, and persisted-recovery tests remain backend prior art and need not be duplicated in the UI suite.
- The current Vitest setup uses a Node environment and includes only src/**/*.test.ts; it has no DOM test package or Testing Library.
Rendered-UI testing therefore depends on Ujjwal making or explicitly coordinating the required manifest, lockfile, and Vitest configuration changes, and Leo coordinating UI test files.
This prerequisite must be recorded before implementation starts; existing Node tests alone do not satisfy the rendered-journey boundary.
- Cover create and reload, missing fields, revision conflicts, stale responses, ordered deduplicated progress, lost connections, account changes, and unauthorized events.
- Cover research without a Plan, exact-plan approval, duplicate clicks, Checkout return before payment confirmation, cancellation races, mixed attempt outcomes, and refunds still pending.
- Verify keyboard operation, labels, focus after errors, readable status announcements, mobile layout, and reduced-motion preferences without redesigning the interface.
- Automated tests must not spend money, contact suppliers, or create real commitments.
Run the existing application suite, coordination tests, typecheck, and build before shipping.
- Separately verify the deployed commit, sign-in, authenticated event creation, one real research session, a changed brief, polling, and reload restoration.
Record the environment and actual outcomes without secrets.
Real payment, supplier execution, cancellation, and crash recovery require their own explicit evidence and authorized test conditions.

## Out of Scope

Frontend redesign, new supplier integrations, provider ranking changes, new shared schemas, event history/listing, guest management, negotiation, and automatic retry of uncertain external creates are excluded.
This ticket does not promise live booking availability or complete delivered quotes from the current research implementation.
Publishing this spec does not claim deployment readiness or reassign Leo's other work.

## Further Notes

The baseline is merged main at 6f2597989a1b738293f18972312d4d7ddd2f5db9, including research tickets03/04/06.
Leo's merged interface handoff supplies the field mapping; it is not evidence that the API consumer already exists.
Ujjwal supplies the deployment, database migrations, Clerk application, and server-side provider configuration for live verification.
Controlled integration work can proceed while that environment is prepared.
The implementation ticket is [Connect and verify the existing event journey](../event-integration/issues/01-connect-event-journey.md).

## Coordination prerequisites

Tony owns this integration task and explicitly authorizes functional route and API wiring in the existing frontend files.
This is a scoped exception to the repository rule requiring owner-provided frontend edits; it does not claim Leo approved the change or transfer frontend design ownership.
Leo owns design and any new presentation states.
Send Tony a prompt for Leo if existing screens cannot represent a required state without design work.
Ujjwal's root configuration coordination remains required.
The requested root work is the minimal rendered-UI test setup.

Droid's deployment handoff reports production at 6f2597989a1b738293f18972312d4d7ddd2f5db9, reachable app/sign-in pages, and passing bearer-authenticated MCP initialize/list/ping plus unauthenticated rejection.
These are reported checks, not independent proof of completed sign-in or research.
The same handoff reports missing DATABASE_URL, Stripe configuration, NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL, with hosted migrations pending.
Shared Clerk application ownership/access and completed sign-in remain unverified.
Tony must identify the intended research workspace/model, arrange credentials securely, and agree on a test brief and expected observable result.
Ujjwal coordinates Clerk, database, and Stripe setup.
Do not store credentials in this tracker.
