# Shared contracts

Contract version: 0.4 draft, defined in docs/contracts-draft.md and exported as CONTRACT_VERSION.
Status: proposed until Tony and Leo review the draft; this code is the first implementation of it.

## Use

Import from `src/contracts` using a relative path.
The files import only zod, so browser code, the agent, and the backend can all use them.

- `records.ts`: Zod schemas and types for Brief, ResearchInput, Candidate, ResearchResult, Plan, PlannedAction, Run, Approval, Payment, Attempt, ProgressEntry, Event, and EventView.
  A ResearchResult is read-only research evidence and cannot be approved; a Plan is the bookable proposal the backend derives from it.
- `rules.ts`: pure checks for attempt transitions, deriving a Plan from a ResearchResult, plan approval, approval-to-plan matching, payment coverage, the mode rule, the stale-result publish guard, and the single-flight research lease.
  The database implementation must mirror the publish guard and the lease as conditional writes.
- `fixtures.ts`: three simulated EventView examples: plan ready, booked, and canceled with a pending refund.

## Commands

- `bun install`
- `bun run typecheck`
- `bun run test`

## Not included

No database, Stripe, Clerk, MCP, or Naive code exists here.
Research-specific fixtures (progress, missing fields, partial, failure, cancellation) are added by Tony after this contract is reviewed.
