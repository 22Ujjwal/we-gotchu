# Rendered screen tests

Ujjwal owns this setup; Tony and Leo own the connected journey and screen tests.
This supplies the root-test prerequisite in [spec PR #34](https://github.com/22Ujjwal/we-gotchu/pull/34).
It does not wire screens to the API or change their design.

## Run

Use `bun install --frozen-lockfile` after adopting this branch.

- `bun run test`: all Node and DOM tests, also used by existing CI.
- `bun run test --project dom`: rendered `.test.tsx` tests.
- `bun run test --project node`: existing `.test.ts` tests.
- `bun run test --project dom src/features/example.test.tsx`: one screen suite (replace the path).

Place screen tests alongside their owned code under `src`, named `*.test.tsx`.
Vitest's separate `dom` project uses jsdom. The `node` project retains the existing Node environment and discovery pattern.
On a busy machine, `bun run test --maxWorkers 2` runs the same complete suite with less concurrent database initialization; it does not extend timeouts.
Both resolve the existing TypeScript aliases. No app Vite plugins, server startup, or real credentials are needed.

The development dependencies are jsdom 26 (compatible with the existing Node 24.9 local runtime and Node 22 CI), React Testing Library (including its DOM peer), user-event, and jest-dom matchers.
Import `test`, `expect`, and `vi` from Vitest; globals remain disabled.
DOM matchers and explicit React cleanup are installed by `src/test/setup-dom.ts`.
Each test gets a rejecting fetch stub; override it with controlled responses. Cleanup unmounts React, restores stubbed globals, and returns to real timers. Spies are restored before each test.
This fetch guard does not intercept XMLHttpRequest, Node HTTP, or SDK transports: keep network clients behind the existing customer fetch API boundary.

## Controlled event responses

Use complete shared fixtures from `src/contracts/fixtures.ts`. Match the requested URL and method, and reject unexpected calls rather than silently returning one fixture for every request:

```ts
import { vi } from 'vitest'
import { planReadyEvent } from '#/contracts/fixtures'

vi.mocked(fetch).mockImplementation(async (input, init) => {
  const request = input instanceof Request
    ? input
    : new Request(new URL(String(input), window.location.origin), init)
  if (request.method === 'GET' && new URL(request.url).pathname === '/api/events/evt_sim_1') {
    return Response.json(planReadyEvent)
  }
  throw new Error(`Unexpected API call: ${request.method} ${request.url}`)
})
```

Use `render` and `screen` from `@testing-library/react` and `userEvent.setup()` from `@testing-library/user-event`.
Render the actual screen with its router/auth providers as appropriate; stub external authentication at its boundary.
Assert visible pending, failed, partial, paid, or refunded states and the meaning of outgoing requests.
For multiple polls, return successive complete EventView values with consistent event/run/revision IDs and progress cursors.
Use `findByRole` or `waitFor` for async updates. If a polling test uses fake timers, configure user-event's `advanceTimers` and flush timer updates inside React `act`.
Do not infer payment success from a redirect or use a pending-refund fixture as a completed refund.

The included gallery smoke renders an unchanged existing component, exercises clicks and matchers, and catches missing DOM cleanup when both cases run together.
It is setup evidence only. Controlled-API customer journey tests and actual browser/layout/deployed-provider verification remain the integration owners' work.

## Implementation and verification plan

1. Start from main `1d584e9`; preserve the hosting branch and local handoff.
2. Demonstrate that the existing config ignores a `.test.tsx` rendering test.
3. Add only the five DOM development dependencies, two Vitest projects, and DOM setup.
4. Run the gallery smoke, full application suite, coordination suite, typecheck, and Vercel build.
5. Publish the branch/PR and Ujjwal's status so the journey owners can adopt this prerequisite.

This configuration uses [Vitest projects](https://vitest.dev/guide/projects.html) and explicit [Testing Library cleanup](https://testing-library.com/docs/react-testing-library/setup/).
