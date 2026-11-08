# Foundation task

Owner: Ujjwal.
Purpose: provide one working layout and shared contract for Tony and Leo to build against.
This document assigns implementation work; it does not claim that the dependencies or commands already exist.
Hacking ends at 11:00 AM on November 8, 2026, so the first PR must be minimal and fast.

## Baseline

Keep the current TanStack Start application, Bun package manager, and single package.json.
Follow [ownership](ownership.md) for the concrete directories.
Do not migrate to Next.js or introduce workspaces for this baseline.
Use src/contracts for shared schemas and explicitly simulated fixtures.

There is no separate src/worker process and no job queue or lease system for the hackathon.
Naive's durable agent session does the long supplier work.
Our backend serves only short requests: Stripe webhooks and the guarded MCP endpoint that Naive calls.
A database uniqueness constraint on the action execution key, plus an attempt row, prevents duplicate purchases.
Reconciling an unknown outcome is a plain guarded route or tool that the agent calls.
Deployment must provide a public HTTPS URL for the MCP endpoint, because Naive refuses localhost.

Customer authentication is proposed to use Clerk (@clerk/tanstack-react-start).
It exists only on the local branch feat/clerk-auth and is not merged.
Server code must obtain the customer id only through requireCustomerId() in src/server/auth.ts, which throws a 401-style error when signed out.
Ownership checks depend on that function, not on Clerk directly.
Keys live in .env.local, which is gitignored; document only the variable names VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY, never their values.
The current dev keys are temporary and must be claimed with `bunx clerk@latest auth login`.

## First PR

Keep this PR minimal; anything not listed here waits until after the contract is merged.

1. Translate the [contract draft](../contracts-draft.md) into initial shared schemas with Tony and Leo reviewing inputs, outputs, and states.
2. Add Zod and the three simulated fixtures listed in contract 0.4: plan ready, booked, and canceled with a pending refund.
3. Add a typecheck script and a test runner (Vitest) with a test script.
   Add a GitHub Actions workflow that runs both commands; the research tickets require CI, and main requires PRs.
4. Establish server-only boundaries and verify browser-facing schemas do not import credentials or backend dependencies.
5. Document commands, required environment variable names, and the exact contract version that other branches should consume.

The MCP endpoint, its tool interface, and Clerk integration are separate follow-up work owned by the transactions role; see [transactions](transactions.md).
The public deploy with a stub MCP endpoint (demo plan milestone 1) should happen before or alongside this PR, because it unblocks Tony.
The first PR does not include a worker command, job interface, or queue.

Add Neon, Drizzle, Stripe, and their configuration when the corresponding implementation starts.
They are planned dependencies, not existing capabilities.
Do not create empty packages or pretend database, payment, authentication, or MCP behavior is implemented.

## Completion evidence

A clean checkout installs with Bun and passes the new typecheck and test commands.
Shared schemas accept the agreed fixtures and reject materially invalid input.
Publish those fixtures from src/contracts for both frontend and agent consumers.
Add contract tests that the three fixtures parse and that an unsupported state or mismatched currency is rejected.
Record the tested contract version; consumer tests are deferred until after the hackathon.
Leo can consume the shared fixtures without importing server code.
Tony can consume the same types and the documented MCP tool interface.
Actual supplier transactions remain subject to the product's explicit approvals.
