# Foundation task

Owner: Ujjwal.
Purpose: provide one working layout and shared contract for Tony and Leo to build against.
This document assigns implementation work; it does not claim that the dependencies or commands already exist.

## Baseline

Keep the current TanStack Start application, Bun package manager, and single package.json.
Follow [ownership](ownership.md) for the concrete directories.
Do not migrate to Next.js or introduce workspaces for this baseline.
Use src/contracts for shared schemas and explicitly simulated fixtures.
Use src/worker for a separately started worker process that imports server and agent modules from the same package.
Deployment and SDK runtime compatibility must be checked before choosing the production worker host.

## First PR

1. Translate the [contract draft](../contracts-draft.md) into initial shared schemas with Tony and Leo reviewing inputs, outputs, and states.
2. Add Zod and fixtures for a brief, recommendation, approval, successful action, unknown outcome, and pending refund.
3. Add typecheck and test scripts with a suitable test runner, plus CI that runs those commands.
4. Establish server-only boundaries and verify browser-facing schemas do not import credentials or backend dependencies.
5. Define the worker command and job invocation interface with Tony, verifying that the chosen runtime supports the required SDKs.
6. Document commands, required environment variable names, and the exact contract version that other branches should consume.

Add Neon, Drizzle, Stripe, and their configuration when the corresponding implementation starts.
They are planned dependencies, not existing capabilities.
Do not create empty packages or pretend database, payment, or worker behavior is implemented.

## Completion evidence

A clean checkout installs with Bun and passes the new typecheck and test commands.
Shared schemas accept the agreed fixtures and reject materially invalid input.
Leo can consume the shared fixtures without importing server code.
Tony can consume the same types and the documented worker interface.
CI passes for the foundation PR before the team integrates it.
Actual supplier transactions remain subject to the product's explicit approvals.
