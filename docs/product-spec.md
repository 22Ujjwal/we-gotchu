# Product baseline

Status: agreed product scope, consolidated for the team.
The decision history remains in [ADR 0002](adr/0002-limit-hackathon-scope-and-require-action-approval.md) and the [interview](idea-interview.md).
Technical proposals belong in the [architecture draft](architecture-draft.md).

## Customer outcome

A host describes an event and gets a plan containing a suitable venue and supplies.
The service handles supplier research and the approved reservation and purchase work.
The host manages guests and runs the event.
Planning is free, with a zero service fee.

## Main journey

1. Collect event type, location, date and time with timezone, headcount, total budget, supply needs, and acceptable cancellation costs.
2. Ask follow-up questions only where required information is missing or conflicting.
3. Find suitable options and explain the recommendation against the brief.
4. Let the customer edit the plan before committing.
5. Show the exact venue, supplies, quantities, total cost breakdown, cancellation terms, and actions that approval authorizes.
6. Obtain one approval for the named venue booking and item purchase, then collect the combined customer payment.
7. Show progress and supplier evidence for each action within one event.
8. Let the customer approve one event cancellation covering both commitments within the displayed limits.
9. Show one spending and refund summary with each supplier's actual result.

Three venue options are a demo example, not a product limit or a required result count.
The research must use the actual brief rather than a hard-coded answer.
A changed plan requires renewed approval before executing changed commitments.
External human communication requires approval covering its recipient and purpose.
Read-only research does not itself authorize outreach.

## Demo scope

Use one event containing one venue reservation and one inexpensive supply purchase.
Choose suppliers with verified cancellation terms compatible with the customer's limits.
Aim to complete real bookings and purchases, then cancel both through one event cancellation approval.
A labeled simulation fallback is allowed when live prerequisites cannot be met.
A cancellation request, confirmed cancellation, requested refund, and completed refund are different outcomes.
The interface must tell the truth about each.

## Deferred work

Negotiation is deferred.
Invitations and guest management are optional extensions, with [integration research](guest-management-integrations.md) available for later work.
Guest recruitment and on-site hosting are outside the core service.
The architecture must allow new suppliers and optional services without changing the approval and payment rules.
