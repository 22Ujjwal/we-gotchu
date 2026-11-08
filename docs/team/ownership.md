# Proposed ownership and collaboration contract

## Existing scaffold update

The team has already added a TanStack Start scaffold under src on main.
Preserve that implementation and its package manager.
The earlier Next.js choice and apps/web paths below remain proposals, not migration instructions.
Before editing, the developers must map the role boundaries to the existing src layout and agree on any framework change.
Frontend owns UI routes and components; transactions owns server endpoints and shared configuration; agent workflow owns supplier and runtime modules.
Coordinate shared route files through the transaction owner if UI and server code occupy the same file.

## Original draft

Status: draft for agreement by the four teammates.
Paths below describe the intended repository layout; application files do not exist yet.
Each implementation task has one owner, one branch, and a declared file set.

| Owner | Exclusive primary paths |
| --- | --- |
| Frontend | apps/web/src/app except its api subtree; apps/web/src/components; apps/web/src/features; apps/web/public; frontend journey tests. |
| Agent workflow | packages/agent; packages/suppliers; agent and supplier adapter tests. |
| Transactions and integration | apps/web/src/app/api; apps/worker; packages/contracts; packages/db; packages/transactions; payment, worker, and contract tests. |
| Pitch | docs/pitch; presentation assets under assets/pitch. |

The transaction owner also coordinates root package manifests, lockfiles, TypeScript configuration, workspace configuration, CI, environment-variable documentation, migrations, and shared fixtures.
The api subtree belongs to transactions even though its parent app directory belongs to frontend.
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
