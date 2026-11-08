# Scaffold guide

The repository is a [bun workspace](https://bun.sh/docs/install/workspaces).
Run every command from the repository root.

```bash
bun install
bun run dev         # Next.js on http://localhost:3000
bun run dev:worker  # background worker
```

| Command | What it does |
| --- | --- |
| `bun run build` | Production build of apps/web |
| `bun run lint` | ESLint (Next.js config) on apps/web |
| `bun run typecheck` | `tsc --noEmit` in every workspace |
| `bun run test` | Vitest across `apps/*/src` and `packages/*/src` (`*.test.ts`) |

## Layout

| Path | Contents | Owner |
| --- | --- | --- |
| apps/web/src/app | Next.js App Router pages and layouts | Frontend |
| apps/web/src/app/api | Route handlers (`route.ts`) | Transactions |
| apps/web/src/components, src/features, public | UI components and feature modules | Frontend |
| apps/worker | Long-running jobs outside Vercel request limits | Transactions |
| packages/contracts | Shared Zod schemas from the [contracts draft](contracts-draft.md) | Transactions |
| packages/db | Drizzle schema and migrations for Neon | Transactions |
| packages/transactions | Approval enforcement, payments, refunds | Transactions |
| packages/agent | Research, recommendations, tool invocation | Agent workflow |
| packages/suppliers | Supplier adapters (email, checkout, booking) | Agent workflow |

The [ownership contract](team/ownership.md) is authoritative if this table disagrees with it.

## Workspace packages

Packages are named `@we-gotchu/<dir>` and export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`), so there is no build step.
Add a dependency between workspaces with `"@we-gotchu/contracts": "workspace:*"`.
A package imported by apps/web must also be listed in `transpilePackages` in apps/web/next.config.ts.

Shared TypeScript settings live in tsconfig.base.json; each workspace extends it.
Environment variables are listed in .env.example.

## Not yet installed

Drizzle, the Neon driver, Stripe, the agent SDKs and Playwright are not dependencies yet.
Each owner adds them to their own workspace when they start that work.
