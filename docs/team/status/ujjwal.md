# Ujjwal's status

Owner: Ujjwal.
Responsibility: transactions and integration.
Updated: 2026-11-07T17:37:31-08:00
Baseline: main at 073eafd (merged PR #14).
Branch and PR: docs/backend-decisions, https://github.com/22Ujjwal/we-gotchu/pull/15 (contract 0.4 and doc updates); feat/contracts-foundation, https://github.com/22Ujjwal/we-gotchu/pull/16 (schemas, rules, fixtures, test runner, CI). Status PR #13 is merged.
Other work, not published: feat/clerk-auth (Clerk code, local clone only).
Availability: on branch for PR #15 and PR #16; proposed for everything else. The Clerk code exists only in a local clone.
Tested commit: PR #16 at e6032bd passed typecheck and 35 tests locally; its GitHub CI run is the first run of that workflow. The local Clerk commit passed typecheck and build, but the sign-in flow was not exercised.

## Current result

The merged baseline is TanStack Start with Bun and a single package.json.
[PR #6](https://github.com/22Ujjwal/we-gotchu/pull/6) proposed a Next.js workspace migration and was closed without merging.
On feat/clerk-auth, Clerk is wired in with sign-in and sign-up routes, request middleware, and a server-only requireCustomerId helper in src/server/auth.ts.
On PR #16 (not merged), src/contracts holds the contract 0.4 Zod schemas, pure rules, three simulated fixtures, and Vitest tests.
No database, payment, or MCP endpoint code exists yet.

## Decisions recorded (proposed until the team reviews the doc PR)

- Customer authentication uses Clerk; the identity helper is the only dependency of ownership checks on it.
- There is no separate worker process. Naive's agent session performs long supplier work, and the backend serves short guarded requests only.
- Naive reaches the backend through an MCP endpoint at a public HTTPS URL, authenticated by a bearer secret held in Naive's vault.
- Every guarded call carries an approval, action and execution key that the backend verifies against stored data.
- Purchase tools are allowed on the Naive side; the backend alone enforces approval.
- A Checkout session expires no later than its approval, and a late payment is refunded automatically with no supplier work.

## Runtime evidence

- Clerk: simulated development keys only; sign-in flow unverified.
- Stripe Checkout and refunds: unverified.
- Supplier card funding and supplier checkout: unverified.
- Naive calling the backend over MCP: unverified; the Naive documentation was read, but no request has been made.
- Database and MCP endpoint: not started.

## Contracts and dependencies

Contract version: 0.1 draft is merged; 0.4 is on PR #15 and PR #16 and needs review by Tony and Leo.
Research results are separate from bookable plans, and the backend owns the stale-revision write and the single-flight lease; Tony owns validation and carries run and brief identities.
Execution, supplier cancellation, and the simulated adapter are not part of Tony's six research tickets; Ujjwal covers them until they agree otherwise.
Needs from Tony: review of the Candidate, ResearchResult, and Run fields, and a live check that the backend can poll a finished session.
Needs from Leo: confirmation of the summary and progress fields the interface reads, and a review of the Clerk change to src/routes/__root.tsx.
Needs from the team: sharing and claiming of one Clerk application, and a public URL for the MCP endpoint.

## Next step and blockers

Next step: get Tony and Leo's review of PRs #15 and #16, then deploy a stub MCP endpoint to a stable public URL (demo plan milestone 1).
Hacking ends at 11:00 AM on Nov 8, 2026, so the first code PR is limited to those items.
Blockers: none found after checking.
