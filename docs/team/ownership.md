# Ownership and collaboration contract

Status: team assignments and single-package layout baseline; detailed API schemas remain drafts.
Preserve the existing TanStack Start application and Bun package.
Paths below assign ownership of existing and planned files; planned directories are created during implementation.
Each implementation task has one owner, one branch, and a declared file set.

| Owner | Exclusive primary paths |
| --- | --- |
| Frontend, Leo | src/routes except src/routes/api; src/components; src/features; src/styles.css; public; UI tests alongside owned code. |
| Agent workflow, Tony | src/agent; src/suppliers; tests alongside owned code. |
| Transactions and integration, Ujjwal | src/routes/api; src/server; src/worker; src/contracts; database migrations; tests alongside owned code. |
| Pitch | docs/pitch; presentation assets under assets/pitch. |

The transaction owner also coordinates root package manifests, lockfiles, TypeScript configuration, build configuration, CI, environment-variable documentation, migrations, and shared fixtures.
The src/routes/api subtree belongs to Ujji even though other route files belong to Leo.
Keep server business logic out of UI route files and behind server-only modules.
Ujji owns src/router.tsx, tsconfig.json, vite.config.ts, package.json, bun.lock, and CI configuration.
Treat src/routeTree.gen.ts as generated output; coordinate route generation through the existing tooling.
Shared schemas and fixtures in src/contracts must not import database clients, credentials, or server-only modules.
Use relative imports initially; Ujji owns any shared alias changes.
The root README and existing planning documents require coordination with the integration owner once implementation starts.

## Change process

Read the current branch and working tree before editing.
Keep each person's work on a separate branch or managed worktree.
Do not change another owner's files, dependencies, or schema independently.
Request the concrete change with its reason, affected consumers, and expected behavior.
The designated owner makes the shared edit and announces its contract version or commit before dependents integrate it.
A shared-contract change requires review by both frontend and agent owners.

Use narrow commits and stage only owned files.
Do not overwrite a colleague's working tree or resolve a semantic conflict by blindly choosing one side.
The integration owner coordinates merge order and checks compatibility.
These rules reduce overlap but do not guarantee that Git conflicts cannot occur.

## Cross-owner boundaries

The frontend depends on application APIs and shared schemas, not database internals.
The agent proposes and executes through guarded services, not direct payment credentials or unrestricted database writes.
The transaction service owns approval validity and durable execution state.
The supplier adapter owns external interaction and returns evidence; the transaction service decides how that evidence changes event state.
The pitch owner uses verified implementation evidence and labels unimplemented features as future work.

## Common instruction for each coding agent

Read your assigned role brief and the shared contract first.
Confirm your branch and declared file ownership before editing.
Implement only your assigned work after the humans begin implementation.
Report needed shared changes to their owner instead of editing around the boundary.
Keep real transactions disabled until the agreed live prerequisites and customer approvals are satisfied.
