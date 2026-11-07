# Limit the hackathon scope and require action approval

We will defer negotiation until after the hackathon.
The first version will find options that fit the customer's needs without negotiating with suppliers.
This replaces the negotiation scope and permission to negotiate recorded in 0001.

We will focus on one working happy path using actual customer inputs and supplier information rather than hard-coded demo results.
This limits the breadth of supported cases, but does not establish unavailable options as available or simulated actions as completed purchases.
The preferred live demo is one event workflow containing a real venue reservation and an inexpensive event-related item purchase.
After booking and purchasing, the customer can request cancellation of the event once and the agent will attempt to cancel both supplier transactions.
The cancellation is intentional for this demo and is not evidence that the venue hosted a completed event.
The item is intended to be canceled as part of the event cancellation, rather than kept as previously proposed.
Live supplier booking and payment are preferred, but Tony authorizes a mock fallback if they cannot finish during the demo.
Mock bookings and payments must be labeled as simulated and do not count as real completed purchases or revenue.
A real customer booking and purchase remain the preferred outcome rather than a guaranteed result of a simulated demo.
Our service is free for the first version, so this replaces the earlier paid-pilot and service-fee goals.

The customer starts with a short event brief and can discuss missing details with the agent.
The customer can review the brief before the agent finds options.
The high-level experience includes an event workspace with options and approvals, with chat available for discussion.
Detailed interface design remains open.

External communication and payment require customer approval before execution.
Tony wants one coordinated customer workflow rather than separate venue and item workflows.
One final event-plan approval may authorize both the specified venue booking and item purchase.
The agent must explain the exact actions and commitments before asking for approval, so a customer's yes has an explicit meaning.
The happy path assumes both transactions are included in that approval.
Approval of the event brief does not grant blanket permission for supplier outreach, booking, or spending.
The customer must be able to cancel before an action executes.
After execution, event cancellation means requesting cancellation of each supplier transaction under its own terms, rather than undoing the original actions.
If one cancellation exceeds the customer's approved limits or cannot complete, the agent should finish the other permitted cancellation and ask about the blocked transaction.
For the hackathon, supplier selection should support cancellation of both transactions within the agreed limits so this exception does not need to be demonstrated.
Refund timing and evidence of completion remain unresolved.

The customer pays one combined total covering supplier costs, applicable taxes, and delivery, with no service fee.
This replaces the earlier decision to collect the service fee separately while the customer pays suppliers directly.
Our service fee is zero.
The total and refund terms must be clear before approval.
The customer sees one combined total with a breakdown of venue cost, item cost, applicable taxes, and delivery, then pays once.
The service clearly states that it charges no service fee.
Before approval, the service shows the amount refundable before the stated cancellation deadline based on the actual supplier terms.
How supplier payments are funded and settled remains unresolved.
The budget for the inexpensive item must reflect customer instructions.
Supplier cancellation terms and any refund must be established before choosing the live venue booking.
The customer must specify acceptable cancellation costs before booking.
Free cancellation or a cancellation fee below $10 are examples of possible customer preferences, not a fixed policy.
The customer's event cancellation request should cover both the venue and the item without separate cancellation requests for each.

The completed flow includes receipts and one event spending summary showing bookings, purchases, payments, and cancellation or refund status.
Corporate purchase orders, departmental approvals, and accounting integrations are deferred.
The first version serves an individual event organizer.

The demo happy path shows three suitable options, with one recommended.
The product has no agreed fixed limit of three places or plans.
Each plan includes a venue and related item, its total, and cancellation terms.
The service shows fewer plans when fewer suitable options are available.
The customer may request changes before approving a plan.

Before searching, the agent clarifies the event type, location, date and time, headcount, total budget, needed supplies, and acceptable cancellation cost.
The total budget includes taxes and delivery.
Preferences such as atmosphere may remain flexible.
The happy-path demo uses a request for which these essential constraints are available.
