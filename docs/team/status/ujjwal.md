# Ujjwal's status

Owner: Ujjwal.
Updated: 2026-11-07T20:08:53-08:00
Baseline: main `1d584e9` (through #37).
Branch and PR: [test/dom-harness](https://github.com/22Ujjwal/we-gotchu/tree/test/dom-harness); DOM setup [PR #39](https://github.com/22Ujjwal/we-gotchu/pull/39) is open.
Availability: DOM test infrastructure on branch; transaction fixes #28 merged; hosting handoff #33 open at last check.
Tested implementation commit: `d8cfaf3`, based on main `1d584e9`; the following commit only adds this PR link and tested SHA.

## Current result

Tony requested the root test prerequisite for the connected event journey in [spec PR #34](https://github.com/22Ujjwal/we-gotchu/pull/34).
This branch adds jsdom 26, React Testing Library and its DOM peer, user-event, and jest-dom as development dependencies.
Vitest runs existing `.test.ts` files in Node and `.test.tsx` files in a separate DOM project.
DOM setup provides matchers, explicit cleanup, reset fetch stubs, restored globals/spies, and real-timer restoration.
Unexpected fetch calls reject; tests must supply controlled customer API responses.

A two-case smoke renders the existing gallery unchanged and exercises user interactions and cleanup.
No screen implementation, styling, API wiring, contract, schema, database migration, or hosted configuration changes are included.
Tony and Leo own rendered journey cases and API wiring; Leo retains design ownership.
See [DOM testing guide](../../testing/dom-tests.md) for commands, fixture use, and a controlled-response example.

## Runtime evidence

- Original config ignored the new `.test.tsx` smoke (no test files found).
- With the DOM project, both gallery cases passed; typecheck passed. jsdom 26 was selected to preserve compatibility with existing local Node 24.9 and CI Node 22.
- All 25 coordination tests passed.
- Complete application suite passed with `bun run test --maxWorkers 2`: 270 tests across 19 files, including the two DOM cases. `NITRO_PRESET=vercel bun run build`, final typecheck, and frozen-lockfile install passed; generated routes remained unchanged.
- Baseline standard run hit existing PGlite 10-second initialization timeouts in `store.test.ts` and `recovery.test.ts`.
- The default run after setup also timed out during PGlite initialization in `brief-revision`, `checkpoint`, `integration`, `store`, and `recovery`. No timeout values or backend implementation were changed. The complete two-worker rerun passed without extending timeouts.

## Contracts and dependencies

Shared contract version remains 0.4. No new public schemas or fields.
Consumers should adopt this root manifest/lockfile/configuration before adding `.test.tsx` journey tests and run `bun install --frozen-lockfile`.
`bun run test` includes both projects; `bun run test --project dom` runs screen tests only.
Use complete EventView fixtures and explicit test responses. A pending refund fixture is not proof of completed refund, and a completed research result need not contain a bookable Plan.

## Next step and blockers

Publish and merge the DOM setup PR; Tony/Leo can proceed with controlled-response integration without hosted credentials.
Real hosted journey testing remains blocked separately by shared Clerk claim/access and login verification, Neon configuration/migrations, and research provider setup. Stripe credentials and webhook setup are additionally required for Checkout/payment testing.

## Hosted evidence (separate handoff)

The last verified production deployment was Git main `6f2597989a1b738293f18972312d4d7ddd2f5db9`, deployment `dpl_6DF759cX1FR8Hff39C2hhfC7vYDm`.
App: https://we-gotchu.vercel.app
MCP: https://we-gotchu.vercel.app/api/mcp
App and sign-in pages returned 200; authenticated MCP initialize/list/ping passed and unauthenticated POST returned 401. Browser GET to MCP returns 405 by design.
Those checks do not establish completed Clerk sign-in, database migrations, research completion, or Naive-to-MCP connectivity.
Production configuration last checked contained Clerk development keys, MCP bearer, and APP_URL; no database, Stripe, Naive, or Monid configuration.
The claimed shared Clerk application and access list remain unconfirmed. No teammate approval is inferred.
Hosting follow-up and detailed evidence: [PR #33](https://github.com/22Ujjwal/we-gotchu/pull/33).
