# External agent planning connection handoff

Owner: Ujjwal. Updated: 2026-11-08T08:42:40-08:00.
Baseline: `b986ab636725029fc6c1b694a1c34494a42a7bca` (cached main; no fetch during implementation).
Branch: `feat/agent-connect`, local only. PR: not published. Availability: on branch, not merged/deployed.
Tested implementation: `4b5f95c4ff115ec59e18c1c061cf57d83dd80d6a`.

## Current result

External-agent planning gateway with five tools: capabilities, start, read/poll, refine, and toggle selection. Reuses the existing planning service and persistence. Every planning response carries a customer review URL and explicitly unverified fulfillment. There are no approval, inquiry-send, payment or booking tools.

Owned implementation is `src/server/agent-connect/**` and `integrations/arrange-agent-connect/**`. The latter contains the official MCP adapter and separate SDK lockfile. Both MCP and JSON are injectable handler factories; no public route is mounted. Internal Naive `/api/mcp`, planning code, frontend, migrations, root dependency/config files and generated routes are untouched.

See [integration README](../../integrations/arrange-agent-connect/README.md) for exact tool arguments, result fields, status/error handling, proposed configuration names, identity/admission responsibilities and a client recipe. Shared planning/transaction contracts are unchanged; the new external projection is separate and allowlisted.

## Commits in order

- `c7c092c`: design and staged plan.
- `dc7f4cf`: customer-scoped gateway, schemas, token digest verifier, permission/output/retry tests.
- `2e12b55`: bridge to existing planning service and durable PGlite integration tests.
- `0426c74`: guarded JSON/HTTP requests with authentication, body bounds and origin checks.
- `b7edf70`: official MCP SDK adapter, concurrent client tests and isolated package checks.

- `a6742ed`: integration README, initial handoff and status evidence.
- `4b5f95c`: independent-review fix for stalled cancellation after timeout/oversize rejection.

All are local. No coauthor attribution. The final documentation-only commit follows these implementation commits; use the branch log for its SHA.

## Verification evidence

At the tested implementation SHA:

- 557 application tests pass, including 34 agent-connect tests. Command: `bun run test --maxWorkers=1`.
- 25 coordination tests pass: `node --test tools/team-coordination/*.test.mjs`.
- Root `bun run typecheck` and `NITRO_PRESET=vercel bun run build` pass.
- Isolated package: frozen dependency install, 4 official-client MCP tests, checked-JavaScript typecheck and Node-target bundle pass.
- No tracked generated-route changes; ownership diff restricted to new gateway/package and Ujjwal documentation.

An initial final-suite run with two workers alongside a build hit the unchanged five-second timeout in two existing database tests; 555 other tests passed. Both database tests then passed in isolation, and all 557 passed with one worker, with no timeout or existing test edits.

Tests establish local scope enforcement, cross-customer rejection, request identity isolation, durable replay, version conflicts, output redaction and transport behavior. Planning-provider results are simulated. No provider research, email, payment, deployment, or client enrollment was performed. No hosted/client-specific end-to-end claim follows from these results.

## Integration dependencies and next step

Tony can continue planner/customer-flow integration independently. Before mounting this gateway, reconcile the existing planning bridge against his final merged service contract and rerun these tests. Do not cherry-pick changes to his files: this branch contains none. Public external-agent availability additionally requires:

1. Customer-bound enrollment and durable token/grant lookup with revocation. Manual opaque tokens are pilot-only; public OAuth discovery/consent is not implemented.
2. A durable admission implementation with customer/client quotas, budget controls and idempotent accounting. The required callback is intentionally not supplied with a permissive production default.
3. Agreed separate endpoint paths, trusted HTTPS origins/audience, proxy configuration, runtime composition, route generation and CI coverage for the isolated package. These shared changes require coordination.
4. Hosted identity-isolation tests plus one real supported external client. Grok developer API has a documented path; actual Grok/Muse/Dot compatibility remains unverified.
5. A later, separately reviewed fulfillment-status contract after Tony's inquiry/offer/payment work. Planning readiness must never be shown as booking confirmation.

Ujjwal's next milestone is to review this local integration candidate, then authorize publication when ready. Nothing here blocks Tony/Leo's existing frontend integration. No credentials are needed for local checks; provider secrets must never be included in an agent connector configuration.

## Decisions and limitations

- Chose planning/tracking plus customer handoff for the first increment. This fits sandbox-only authority; cost: outside agents cannot complete bookings autonomously yet.
- Kept hosted routes and root dependencies untouched to preserve parallel team work. Cost: deploy/enrollment/admission/CI integration remains required.
- Used an isolated checked-JavaScript SDK package because root TypeScript includes every `.ts` file. Cost: its own install and checks must be run explicitly.
- No claims about universal agent compatibility, OAuth interoperability, completed real research or supplier commitments. The branch is an integration candidate, not a public booking product.

## Independent review and disposition

The fresh reviewer found no Critical issue and one Important issue: waiting for a stream's cancellation promise could prevent timed-out/oversized HTTP requests from returning. Regressions reproduced both cases, then passed after cleanup became nonblocking. Both JSON and MCP share that corrected boundary.

Deferred minor: `authority.plan` describes the gateway-wide capability even for read-only grants. Scope-filtered tool discovery and execution correctly deny planning writes, but a client relying only on that flag could offer an unavailable action. Use the discovered tool list as the permission-specific capability contract until the metadata is refined.

The following review exclusions remain deliberate integration boundaries, not evidence of verified behavior:

| Decision | Reason and consequence |
| --- | --- |
| Leave public routing, deployment and proxy behavior for integration | Factories only; no usable public endpoint yet |
| Defer OAuth consent/enrollment/client registration | Controlled pilot seam only; no general OAuth connection claim |
| Delegate token issuance, entropy, revocation and unique grant IDs to trusted storage | No hosted issuer supplied; public exposure requires this integration |
| Require durable quota, budget and retry accounting through admission | No permissive production default; implement and test before hosting |
| Leave token-lookup/discovery abuse limits to infrastructure | Planning admission does not cover those operations |
| Do not certify provider truth, prices or availability from fixtures | No successful real research evidence from this branch |
| Exclude inquiry sends, payments, supplier commitments and booking | Customer approval remains in Arrange; autonomous booking is not delivered yet |
| Defer named-client validation | Official-client tests do not prove Grok/Muse/Dot support |
| Review Tony's unpublished/future contract after it is available | Avoid parallel edits; reconcile the bridge before integration |
| Leave unchanged service recovery/concurrency outside this adapter's review | Ownership/replay/version tests do not establish blanket reliability |
| Return marked untrusted source data without fetching it | Consuming agents must enforce browsing and prompt-injection boundaries |
| Coordinate root CI wiring separately | Run isolated package checks explicitly until shared CI includes them |
| Defer exhaustive upstream SDK audit and production load testing | Local functional review does not certify production security/performance |
