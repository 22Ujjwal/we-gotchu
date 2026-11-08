# Frontend handoff

Assigned teammate: Leo.
Leo owns frontend under the shared ownership contract.

You own the customer journey from event intake to cancellation and refund visibility.
Read the [contract draft](../contracts-draft.md) and [ownership rules](ownership.md) before implementation.

## Hackathon deliverables

Follow the [demo plan](demo-plan.md) milestone 6 and contract 0.4.
Build one event page with intake and a "Use demo brief" button, the plan with the agent's reasons and sources, one approve-and-pay button, a progress log that polls GET /api/events/:id, and one cancel button.
Mark the two customer steps as human and every other progress entry as agent in the log.
Show `live`, `test`, or `simulated` beside each payment and action.
Start from the contract fixtures and switch to the real API when milestone 4 lands.
Plan editing is deferred; a different plan means a new event for the demo.

## Deliverables

Build guided intake with follow-up questions for missing details.
Show suitable options, their sources, and how they meet the brief.
Allow plan edits without silently carrying old approval forward.
Show the exact combined total, zero service fee, both commitments, and cancellation terms before approval.
Provide one clear approval action for the displayed commitments.
Display payment, venue, item, cancellation, and refund progress inside one event view.
Use one cancellation confirmation for both commitments and show each resulting status.

Do not impose a maximum of three candidates in the product contract.
Use three only in the demo fixture if useful.
Do not equate a disabled spinner, successful navigation, or agent text with a completed transaction.
Use the server's EventSummary and restore it after reload.

## Dependencies and boundaries

Start against the integration owner's versioned fixtures and API contract.
Request contract changes through that owner.
Do not call Naive, Stripe secret APIs, supplier checkout, or the database directly from the browser.
Keep provider-specific details out of customer screens unless they affect a decision or explain an outcome.

## Acceptance

Complete the happy path with simulated fixtures first.
For the demo, also show refund pending and an `unknown` attempt; stale-plan feedback and partial completion are deferred.
Use accessible names and keyboard navigation, clear form errors, and reduced-motion support.
Persist no secrets in browser storage.
Give the pitch owner a stable demo URL only after deployment exists and has been verified.

## Copyable agent assignment

Implement the frontend role described in this file after the team approves the shared contract.
Stay inside the frontend paths in ownership.md and consume versioned shared fixtures.
Do not implement provider execution or change shared schemas independently.
Report the tested customer flows and any remaining integration dependencies.
