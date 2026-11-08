# Ujjwal's status

Owner: Ujjwal.
Responsibility: transactions and integration.
Updated: 2026-11-07T18:10:00-08:00
Baseline: main at 073eafd (merged PR #14).
Branch and PR: docs/backend-decisions (contract 0.4 and doc updates), PR link below once opened. Status PR #13 is merged.
Other work, not published: feat/clerk-auth (Clerk code, local clone only).
Availability: proposed. The Clerk code exists only in a local clone and is not published.
Tested commit: the local Clerk commit passed typecheck and build and served the home and sign-in pages in a dev server. The sign-in flow itself was not exercised.

## Current result

The merged baseline is TanStack Start with Bun and a single package.json.
[PR #6](https://github.com/22Ujjwal/we-gotchu/pull/6) proposed a Next.js workspace migration and was closed without merging.
On feat/clerk-auth, Clerk is wired in with sign-in and sign-up routes, request middleware, and a server-only requireCustomerId helper in src/server/auth.ts.
Nothing else in the transaction service exists yet: no schemas, database, payment, or MCP endpoint code.

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

Contract version: 0.1 draft is merged; a 0.4 hackathon cut aligned with Tony's research spec is on docs/backend-decisions and needs review by Tony and Leo.
Needs from Tony: confirmation that supplier checkout runs inside the Naive session and that the agent can call a public HTTPS endpoint during a run.
Needs from Leo: confirmation of the summary and progress fields the interface reads, and a review of the Clerk change to src/routes/__root.tsx.
Needs from the team: sharing and claiming of one Clerk application, and a public URL for the MCP endpoint.

## Next step and blockers

Next step: publish the doc update for review, deploy a stub MCP endpoint to a stable public URL (demo plan milestone 1), then the first code PR with Zod schemas, simulated fixtures and a test runner.
Hacking ends at 11:00 AM on Nov 8, 2026, so the first code PR is limited to those items.
Blockers: none found after checking.
