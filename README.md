# We Gotchu

## Problem

Planning an event means coordinating a venue, supplies, availability, budgets, and cancellation terms across different suppliers.
The host has to compare options, make separate bookings and purchases, and track what is confirmed.
If plans change, they have to cancel each commitment and follow each refund themselves.

## Solution

We Gotchu turns the host's requirements into one event plan with a venue, supplies, a cost breakdown, and cancellation terms.
The host reviews and approves the specific actions before the service books the venue and purchases the supplies.
One event view shows progress and supplier confirmations.
If the host cancels the event, the service coordinates the approved cancellations and reports each result and refund status.
Planning is free; the customer pays the approved event costs.

## Project status

The repository contains planning documents and an existing TanStack Start application scaffold.
The scaffold was added separately by the team; the documentation work does not verify its runtime behavior.
See the preserved [scaffold guide](docs/scaffold-guide.md) for its original setup instructions.
The product scope is agreed, while the architecture and team contracts are drafts for team review.
No live booking, payment, cancellation, or deployment has been verified.

## Start here

For a local UI preview without service credentials, run `bun install`, add
`VITE_LOCAL_PREVIEW=true` to `.env.local`, then run `bun run dev` and open
http://localhost:3000. This previews the brief and venue flow using fixture data.
Sign-in, sign-up, API routes, and server functions are unavailable in this mode.
The flag is ignored by production builds. To use the backend locally, remove the
flag and configure the credentials listed in `.env.example`.

1. Read the [product baseline](docs/product-spec.md).
2. Review the [architecture](docs/architecture-draft.md) and [shared contracts](docs/contracts-draft.md).
3. Pick your [team handoff](docs/team/README.md) and follow the ownership boundaries.
4. Use the [demo acceptance checklist](docs/demo-acceptance.md) to distinguish working integrations from simulations.
5. Follow the [demo plan](docs/team/demo-plan.md) for the hackathon critical path.

The [decision map](.scratch/event-demo/map.md) records completed research and unresolved human decisions.
The [research index](docs/research-index.md) links the two immutable research reports.
The [sponsor notes](docs/hackathon-sponsors.md) record the four-person team's available benefits.
The current task stops at this draft handoff, before application implementation.
