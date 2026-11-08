# Demo acceptance draft

Status: proposed acceptance checklist for implementation, not a claim of completed tests.
The demo has one event, one venue, and one supply purchase.
Three candidate venues can illustrate the happy path without imposing a product limit.

## Customer journey

- Intake accepts a real brief and asks for missing required details.
- Research returns evidence-backed candidates that respond to changes in the brief.
- The final plan names both commitments, their total cost, and cancellation limits.
- One approval clearly authorizes both commitments and any included supplier communication.
- One combined customer payment appears with a zero service fee and understandable cost breakdown.
- Supplier confirmation references support each completed action.
- One cancellation approval starts cancellation of both commitments within its limits.
- The event summary distinguishes confirmed cancellations, retained costs, supplier recovery, and the customer's refund status.

## Integration checks

- Repeating approval, Checkout requests, webhooks, or worker delivery does not duplicate charges or bookings.
- A stale plan revision or changed price stops execution until renewed approval.
- An unauthorized customer cannot read or mutate another event.
- A supplier timeout triggers reconciliation before any purchase retry.
- Cancellation during execution prevents unstarted work and reconciles work already in flight.
- One failed supplier action leaves the successful action visible and does not invent an automatic rollback.
- Reloading the browser restores the authoritative event and progress.
- Keyboard navigation, named controls, error text, and reduced-motion behavior work throughout the core journey.

## Live evidence and fallback

The transaction owner verifies customer payment state and captures provider references without sensitive card details.
The agent owner verifies supplier references, exact terms, and cancellation results.
The pitch owner labels every recorded or simulated segment before presenting it.
The live or simulated mode is visible in the UI and retained in the records.
A browser click, agent message, local spend entry, or Checkout return URL alone is not purchase evidence.

Before collecting live money, verify the selected suppliers, account eligibility, supplier funding, secure checkout, and refund policy.
If any prerequisite is missing, use the labeled simulation path for that portion.
Do not turn a simulated payment into live supplier spending.
A valid demo can end with cancellations confirmed and refunds pending if that is what providers report.
Do not claim refunded money has arrived without evidence.

## Handoff completion

The documentation stage is complete when each team role has a brief, shared boundaries, dependencies, and acceptance criteria.
Unapproved design choices remain explicitly proposed.
No application implementation or live transaction belongs to this documentation stage.
