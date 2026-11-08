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

At main `14cab2e`, contracts #16, Clerk #17, standalone research #18, frontend #19, and backend core #20 are merged. Hosted integration is not established by those merges.
The shared route repair [#26](https://github.com/22Ujjwal/we-gotchu/pull/26) is a dependency of deployment [#21](https://github.com/22Ujjwal/we-gotchu/pull/21) and the open integration work.
Tony's research integration [#24](https://github.com/22Ujjwal/we-gotchu/pull/24) is stacked on supplier evidence [#25](https://github.com/22Ujjwal/we-gotchu/pull/25); both remain under review. Root CI [#27](https://github.com/22Ujjwal/we-gotchu/pull/27) also needs Ujjwal's review.
Recheck current PR state before integrating; these entries record dependencies, not owner approval.
