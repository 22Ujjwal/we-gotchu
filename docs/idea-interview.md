# Event service idea interview

## Customer promise

The customer describes an event, reviews suitable options, and authorizes the service to arrange a venue and related purchases.
The service performs the supplier work and presents booking confirmations, receipts, and one spending summary.
One event cancellation request covers the associated venue booking and item purchase.

## Team discussion supplied by Tony

The discussion supports a narrow demo with a venue and an inexpensive item in one event workflow.
Negotiation, invitations, guest recruitment, reminders, and running the event in person remain outside the hackathon scope.
The transcript includes competing suggestions about showing one option or several, allowing edits, adding a separate payment confirmation, and stopping before venue payment.
The demo happy path shows three suitable options, one recommended, with changes allowed before approval.
Three is not a product limit on places, search results, or plans.
Tony's explicit answers establish one clear final approval for both transactions and a preference for real execution with a labeled mock fallback.
The latest payment decision is one combined total for supplier costs, applicable taxes, and delivery, with no service fee.
Tony chose to make our service free for the first version.

## Open product decisions

- Supplier settlement responsibility.
- How supplier availability, cancellation, and refund completion are verified.

## Scope confirmation and extensions

Tony accepted the overall happy-path scope after the service fee was removed.
The design must be modular and extensible even though the demo covers a narrow path.
Invitation and guest-management integrations are being investigated as optional extensions.
The request to investigate these services does not yet add invitations to the required demo.
See [integration research](./guest-management-integrations.md) and [the modular design decision](./adr/0003-keep-service-integrations-independent.md).
Tony supplied the [hackathon sponsor list](./hackathon-sponsors.md) as context for upcoming integration and technology choices.
Tony also supplied the [prize-track slide](./hackathon-prize-tracks.md), including the main track's focus on a company likely to scale to millions.
The product idea is defined sufficiently for build planning, while revenue and demand beyond the friend pilot remain unvalidated.
Supplier selection, live integration checks, payment settlement, and the exact demo sequence belong in build planning.
Tony has authorized Wayfinder to resolve those decisions before implementation tickets are split across the four-person team.
Its destination includes an implementation-ready plan, shared integration contracts, and file-ownership rules for the teammates and their agents.
Tony subsequently set the team split to one pitch owner, one frontend owner, and two remaining developers.
Time constraints should not drive the architecture discussion.
The [stack and ownership proposal](./stack-proposal.md) records recommendations that still need a team decision.

## Demo evidence

The planned live booking, purchase, and subsequent cancellations would demonstrate execution and cancellation handling.
A fully refunded demo transaction does not demonstrate retained revenue or a successfully hosted event.
Supplier replies, confirmations, receipts, and refund records should distinguish completed actions from requests and simulations.
