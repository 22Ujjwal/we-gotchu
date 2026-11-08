# Tony's status

Owner: Tony.
Updated: 2026-11-07, America/Los_Angeles.
Implementation baseline: main at `4f50215`.
Branch: feat/research-workflow, merged by PR #18 as `b181e1e`.
Availability: merged.
Prior report commit: `f756c9bd1cd86b779ebc6fe418da75b914bd9a68`.
Implementation verification at `4a50290`: 45 tests, typecheck, and production build passed using Bun 1.4.4.
The live smoke ran that implementation and cleaned up its evaluation session and definition.
PR review fixes on top of `dac021a`: 50 tests, typecheck, and production build passed using Bun 1.3.11; the live smoke was not rerun.
The GitHub ci check passed on PR #18 at `eaac453`.

## Current result

Ticket 01 now has a standalone read-only research workflow on main.
It imports the merged contract 0.4 and includes real Monid discovery and Naive ranking adapters.
The live smoke check returned six candidates with source provenance and unknown final costs after one bounded correction.
The workflow is not wired into the application API or database yet.
The backend startResearch and advanceResearch polling integration remains coordinated work under ticket 05.
See [runtime instructions and verification](../../../src/agent/README.md).

## Earlier research evidence

Naive pi is live-verified for one synthetic read-only research session using `openai/gpt-4.1-nano`, with a $0.50 cap and all ordinary tools denied except web_search.
The first turn failed required structured output, and one corrective message produced a conforming object.
SSE progress, text deltas, sequence replay, message-based resumption, and terminal cancellation were observed.
The isolated managed-agents SDK 0.12.3 also parsed live harness and canceled-session responses.
The returned recommendation remains simulated and contains an unsupported budget claim, so it must not become an approved plan.
The session reported $0.002983 consumed; organization billing reconciliation was blocked by missing billing:read scope.
Monid product and Maps searches completed with provider HTTP 200 and reported costs of $0.007 and $0.00015.
No supplier availability, final price, booking, order, payment, cancellation, or refund was verified.

## Verification and cleanup

Local assertions checked structured-result fields and types, enum values, event identity, two-source bound, event sequences 1 through 53, and the observed tool allowlist.
Documentation checks covered ASCII, embedded JSON, local links, whitespace, and credential-pattern scanning.
That earlier documentation-only report ran no application build or test suite; package.json had no test script then.
The evaluation session is canceled, the evaluation agent is deleted, and GET of its computer returned null.
Both Monid runs are terminal, with no persistent resource provisioned by either search.
Temporary SDK dependencies were removed, while credential-free snapshots remain under `/tmp/we-gotchu-agent-research` for local review.
The existing .entire metadata was preserved.

## Contracts and next steps

The [research specification](../../../.scratch/specs/agent-research.md) is approved and merged through PR #11.
Tony approved six implementation slices covering discovery, supplier details, recommendations, brief changes, progress, and recovery.
The local implementation tracker publishes those slices separately with explicit dependencies.
Ujjwal's PR #16 merged shared schemas, fixtures, Vitest, and CI configuration.
Database and MCP integration remain separate work.
His proposed backend changes require review and do not establish a working integration.
Leo's PR #12 provides an application shell and contract questions, not the research interface.

The research workflow now codes against the merged contract 0.4; provenance rule changes go to Ujjwal as contract changes.
Tony can next implement quantity normalization, semantic evidence validation, and progress persistence using shared fixtures.
Ujjwal must provide the guarded transaction interface and exact-action approval checks before supplier execution.
Approval denial and call-scoped resume, budget exhaustion, forced disconnect and crash recovery, and Naive-to-provider MCP remain untested.
The research worker must reject unsupported cost and availability claims even when the JSON schema passes.
Supplier access, secure checkout, confirmations, cancellation terms, and reconciliation remain separate blockers to live commitments.
