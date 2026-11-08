# Agent-led planning capability proof

This pass explores the replacement research architecture locally.
It does not change the customer application or push a branch.
The goal is a useful chat, research, information, and selection flow with less custom orchestration.

## Decision

Prefer a reusable Naive research agent connected directly to Monid's hosted MCP server.
Use the published SDK for hosted sessions, follow-up messages, structured output, and resumable events.
Use Neon for application identity, messages, proposals, selection, and the provider cursor.
Keep the existing Clerk authentication and defer Stripe.

This replaces the current ranking-only prompt and application-owned research loop after the new path passes live acceptance.
It does not require a custom Monid proxy, a new team of agents, or exposing the application's transaction MCP tools to the researcher.

## Evidence inspected

The existing session adapter explicitly denies tools and asks Naive only to order candidate IDs.
The current ranking input also removes evidence prose before sending candidates.
Those choices explain why the existing agent cannot interpret missing venue or pack information.

The installed proof package is @usenaive-sdk/managed-agents 0.12.3.
Naive documents same-session messages, schema-constrained results, durable events, and hosted MCP connections.
Monid publishes a streamable HTTP MCP server at https://mcp.monid.ai/v1.
An authenticated tools/list request with the existing Monid key returned HTTP200 and discover, inspect, run, and get-run tools.
No custom adapter was necessary for that catalog check.

Sources:

- [Naive TypeScript SDK](https://usenaive.ai/docs/sdk/typescript.md).
- [Naive sessions](https://usenaive.ai/docs/sdk/sessions.md).
- [Naive structured output](https://usenaive.ai/docs/capabilities/structured-outputs.md).
- [Naive tools and MCP](https://usenaive.ai/docs/capabilities/tools.md).
- [Naive vaults](https://usenaive.ai/docs/sdk/vaults.md).
- [Monid hosted MCP](https://monid.ai/blog/guides/mcp-server-live-web-data-agents).

## Direct MCP experiment

Proof ID: c7d25fa2-caae-4d3e-82fc-7ae7ce3fd189.
Naive agent creation succeeded, but vault creation returned HTTP403 forbidden.
A diagnostic request confirmed the message: this API key is missing the admin scope.
No session started, no Monid credential was uploaded, and the temporary agent was deleted.
The existing account had no vault returned by the inspected first page.
Direct hosted Naive-to-Monid tool use remains unverified.

Required setup is an administrator-authorized Monid MCP credential in Naive, preferably bound to the reusable research agent.
Do this once during setup rather than granting every customer event admin access.
Do not send credentials in chat or put them in the agent prompt.

## Saved-evidence experiment

Proof ID: 17cd5952-605f-4e1d-84c0-9b9f86fee4e5.
Session: ses_49pev2j45mpdkjn9mcn804vk0e.
The script read three previously completed Monid run records from the local application test.
It supplied the raw returned venue page and two product records to the hosted Naive session.
This mode did not perform new searches and does not prove the agent chose research tools.

Naive returned a structured proposal with one venue and two supply options.
It interpreted the mixed birthday set as serving up to 24 guests and surfaced its USD69.98 listing price.
It also surfaced the USD11.02 twenty-plate listing and noticed the New Year theme mismatch.
The old exact-sentence parser had not understood the mixed set's coverage.
The venue description became useful information while unpublished rental rates and capacity stayed unknown.

A follow-up selected the birthday set and asked for a cheaper plan.
The same session returned a second proposal, preserving the selected option ID.
The provider reported 7857 micro-USD consumed at the second result.
That is a reported session value, not an independently reconciled account invoice.
The session was canceled and its temporary agent deleted after the test.

## Quality findings

The first prompt let the model populate selectedOptionId before the customer had chosen anything.
The follow-up also claimed that buying missing accessories separately would cost more without retrieved accessory prices.
Those are product quality failures even though the two-turn protocol worked.
The prompt now requires an empty initial selection and cost comparisons supported by retrieved prices.
Production must keep customer selection authoritative in application storage.
The model's recommendation must not be used as evidence that the customer selected it.

A refined run, bfaa1ebd-f99b-42c9-a35a-1cd0c66daac3, received HTTP429 rate_limited before agent creation.
No resources were created by that attempt.
The delayed retry was 94da037c-15da-4d74-b8c8-c96e08d5b343, session ses_19g67yyv7tsbya0xd45368y1wt.
Both turns completed, and the customer-selected afoxsos-set-212 ID survived the follow-up.
The second proposal acknowledged that accessory prices were unavailable instead of claiming separate purchases were more expensive.
It reported 9540 micro-USD consumed after the second turn.
The session was canceled and the temporary agent deleted.

The strict success flag was false because the initial selection was the string "null", not a null value.
Its proposal still included unsupported venue-cost speculation and an incorrect statement that no supply choice could save the budget above roughly USD430 of venue cost.
The lower-priced plates actually leave USD488.98 before unknown charges, so that blanket conclusion is not supported.
This is a promising interpretation and conversation proof, not a product-quality acceptance pass.
The runner now returns a failing process status for a false success flag; the retry had already started before that exit-status-only correction.
Production selection stays in application state, and exact budget arithmetic stays in code.
These findings should guide the focused implementation rather than another round of keyword parsing.

## Next implementation

Use the [focused spec](../../.scratch/specs/agent-led-event-planning.md) and [single ticket](../../.scratch/agent-conversation/issues/01-agent-led-research-and-selection.md).
Do not expand the keyword extractor while the agent-led replacement is being evaluated.
Do not report hosted tool choice, Neon conversation persistence, browser restoration, or the customer chat UI as implemented by this proof.

## Terra desktop handoff

After implementation, test the actual local application at its exact final head.
Enter the birthday brief in chat, review readable options and published prices, select an option, ask for a cheaper plan, and reload.
Check that selection and conversation survive, no new session is created by reload, and technical provider diagnostics stay out of the customer flow.
Use one controlled fixture journey for repeatable errors, then one real provider journey.
No payments, bookings, or supplier messages belong to this acceptance test.
The earlier dev server stopped when T3 restarted; this pass does not restart it or run browser automation.

## Local verification

Executed node --test tools/agent-research-proof/proposal.test.mjs and node --check tools/agent-research-proof/proof.mjs.
The isolated call-boundary test, script syntax check, and git diff --check passed.
The earlier 379 application tests apply to the preceding local coverage change, not to proof of this new architecture.
This pass changed only the isolated proof, its local package files, the spec, the ticket, and this evidence note.
No production source or root package/config/lockfile changed in this pass.
