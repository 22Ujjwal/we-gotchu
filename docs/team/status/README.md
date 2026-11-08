# Team status index

This index links the owners and their handoffs.
Entries start as unverified until each owner publishes their own update.
Do not interpret an empty branch field as proof that a teammate is idle.

| Owner | Responsibility | Status file |
| --- | --- | --- |
| Tony | Agent workflow and suppliers | [Tony](tony.md) |
| Leo | Frontend | [Leo](leo.md) |
| Ujjwal | Transactions and integration | [Ujjwal](ujjwal.md) |
| Ferdinand | Pitch and demo narrative | [Ferdinand](ferdinand.md) |

Use the [coordination workflow](../coordination.md) and [handoff template](template.md).
Ujji coordinates updates to this index; each person owns their individual status file.

## Known work under review

[PR #6](https://github.com/22Ujjwal/we-gotchu/pull/6), the proposed Next.js workspace migration, is closed without merging. The merged baseline remains TanStack Start with Bun.

At main `a6afd9f`, contracts #16, Clerk #17, standalone research #18, frontend #19, backend core #20, deployment #21, coordination #23 and #27, research integration #24, supplier evidence #25, the shared route repair #26, transaction fixes #28, frontend handoff #29, and brief revision fixes #30 are merged.
The production app and direct bearer-authenticated MCP ping are live-verified; shared Clerk ownership, completed sign-in, hosted database/payment setup, and Naive-session connectivity remain pending. See [Ujjwal's hosted setup handoff](ujjwal.md) for URLs and evidence.
Recheck current PR state before integrating; these entries record availability, not teammate approval or runtime evidence.
