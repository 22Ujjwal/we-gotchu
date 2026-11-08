# First agent research readiness

Checked on 2026-11-07 in America/Los_Angeles, with runtime evidence recorded on 2026-11-08 UTC.
This report covers one synthetic Naive session, two read-only Monid searches, current primary documentation, and implementation recommendations.
It does not verify any supplier booking, stock, quote, payment, cancellation, or refund.

## Recommendation and baseline

Build the first agent as a research-only worker that returns evidence-backed candidates and missing fields.
Keep supplier execution disabled until the transaction service, exact-action approval, and supplier reconciliation contracts exist.
Naive pi can run web search and return structured data in this account, but the tested model needed a corrective turn and produced an unsupported budget claim.
The application must reject unsupported conclusions even when the JSON shape passes.

The fetched main baseline is `a54e054cc48a15c2b30ae170db662849d1597185`, which uses TanStack Start and Bun.
The live GitHub check found [PR #6](https://github.com/22Ujjwal/we-gotchu/pull/6) OPEN, with no merge commit and head `9c45fa2aaafa7522420c987562c192bbf0ead792`.
Its Next.js migration is proposed, not the merged framework baseline.
Keep the research module independent of route conventions until that decision settles.
The implementation contract remains [version 0.1 draft](../contracts-draft.md), not an implemented shared schema.
This research changes only this report and [Tony's status](../team/status/tony.md).

## What was tested

| Check | Observed result | Boundary |
| --- | --- | --- |
| Authenticated harness discovery | HTTP 200, hosted pi runnable, approvals and structured output and streaming deltas advertised. | Capability discovery does not prove each behavior. |
| Model discovery | HTTP 200, `openai/gpt-4.1-nano` listed. | No model quality comparison was run. |
| Agent and session creation | Both returned HTTP 201 with the requested budget and policy. | Creation used REST, not SDK create methods. |
| Read-only web search | Exactly one `web_search` start and completion appeared. | Search results are leads, not supplier confirmations. |
| Required structured output | First turn failed closed, corrective turn produced the required object. | First-turn reliability is not established. |
| Progress and replay | SSE HTTP 200 with `text/event-stream`, text deltas, tool events, usage, and idle events. | Replaying persisted events is not a forced network-failure recovery test. |
| Message-based resumption | HTTP 202 with `accepted_seq: 28`, followed by events 29 through 53. | Approval resumption and crash recovery remain untested. |
| Terminal cleanup | Cancel returned HTTP 200, then GET confirmed `cancelled`. | Natural `completed`, `failed`, and budget-exhaustion paths were not exercised. |
| SDK readback | Version 0.12.3 parsed live harness and canceled-session responses. | SDK creation and automatic reconnection were not exercised. |
| Monid product and place search | Both runs reached COMPLETED with provider HTTP 200. | The calls ran through the CLI, not through Naive MCP. |

The Naive credential was consumed only by authenticated commands and was not copied into these documents, source files, agent instructions, or temporary scripts.
The explicit `User-Agent: we-gotchu-runtime-check/0.1` worked for REST and SDK fetch.
The parent's default-urllib 403/error1010 observation was supplied context and was not reproduced here.

## Naive experiment and exact evidence

The evaluation agent was `agt_4c7fb34tkgpbmkf6phgby0gzdb`, named `we-gotchu-research-20261107`, version 1.
The only session was `ses_npkft5q2nnn2p5tzg3fvk5yx44`, created at `2026-11-08T00:44:05.641Z`.
It used pi, `openai/gpt-4.1-nano`, the immediate window, and no identity, MCP server, or handoff.
Both the agent period cap and session cap were 500000 micro-USD, or $0.50.
The session reported 2983 micro-USD consumed after two turns, or $0.002983.
This is session-reported usage, not an independently reconciled organization bill.

The initial synthetic input was a 20-person birthday in San Francisco on 2026-12-12, with a USD 500 total budget and paper plates required.
It asked for one venue search, at most two source URLs, and missing planning fields.
The system instructions forbade commitments and required `submit_output`.
The enforced policy denied every ordinary tool except `web_search`, and the observed calls were exactly `web_search` and `submit_output`.
This checks the configured restriction and observed behavior, not an adversarial bypass attempt.
Naive documents that `submit_output` remains available under a deny default because it delivers the answer rather than performing an external action.
Source: [structured output](https://usenaive.ai/docs/capabilities/structured-outputs.md).

The first turn searched `San Francisco event venue rental` and then returned prose.
At sequence 28, `session.idle` contained `stop_reason: "error"` and `structured_output: null`.
Its exact diagnostic was recorded as follows.

```json
{"error":"the session requires a result matching its output schema and produced none: no `submit_output` call satisfied it"}
```
The session's `stop_code` was null, so consumers cannot depend on that field alone to identify a missing document.

One follow-up message instructed the same session to use its existing results, avoid another search, and call `submit_output`.
The send returned `accepted_seq: 28`.
The second SSE request used `after_seq=28` and returned sequences 29 through 53, with `submit_output` at sequence 45 and `session.idle` at sequence 53.
The final stop reason was `end_turn`, while the session status remained `idle` and `ended_at` remained null.
The initial replay contained sequences 1 through 28, so the combined recorded sequence was contiguous from 1 through 53.
Some span timestamps preceded events with lower sequence numbers; use sequence numbers, not timestamp sorting, to consume this log.

The result had exactly the six requested fields, valid scalar and array types, `eventId: "evt-research-001"`, `mode: "simulated"`, and `availabilityVerified: false`.
Local assertions checked those constraints, the two-source bound, contiguous event sequences, and the observed tool allowlist.
A compact projection of the actual result follows.

```json
{
  "eventId": "evt-research-001",
  "mode": "simulated",
  "availabilityVerified": false,
  "sources": [
    "https://www.peerspace.com/venues/san-francisco--ca/event-venue",
    "https://www.peerspace.com/pages/listings/6587dff0cc2cac000dbe8e8a"
  ]
}
```

The omitted summary claimed the venues were within the $500 budget while also admitting costs were missing.
One returned URL was a category page rather than a specific venue.
The model also listed paper-plate preferences as missing even though the brief already required paper plates.
These are quality failures, not verified supplier facts.
Do not promote this output to a valid EventPlan or copy its budget claim into the product UI.
Keep live retrieval evidence distinct from the synthetic event and its simulated recommendation.

## Minimal API and SDK configuration

Use server-side `https://api.vetta.sh` with Bearer authentication and JSON bodies.
Use stable idempotency keys for a retried write, and reconcile an uncertain create before issuing another create.
Do not place the key in browser code or prompt text.
The following is the relevant tested agent configuration, with the instruction text shortened for readability.

```json
{
  "name": "we-gotchu-research-20261107",
  "model": "openai/gpt-4.1-nano",
  "harness": "pi",
  "window": "immediate",
  "handoffs": false,
  "budget": {
    "cap_micro_usd": 500000,
    "max_task_micro_usd": 500000,
    "period": "month"
  },
  "tools": {
    "default_config": { "permission": "deny" },
    "configs": {
      "web_search": { "enabled": true, "permission": "allow" }
    }
  },
  "system": "Research only. Search once. Make no commitments. Return the result through submit_output."
}
```

POST that configuration to `/v1/agents`, then POST `/v1/sessions` with `agent_id`, `agent_version`, `message`, `budget_micro_usd: 500000`, `output_schema`, and `structured_output_required: true`.
The tested schema was an object with `additionalProperties: false` and all six fields required.
It defined `eventId` and `summary` as strings, `sources` and `missingFields` as arrays of strings, `mode` as the enum `simulated`, and `availabilityVerified` as the boolean enum false.
The two-source maximum was a prompt and local assertion constraint, not a schema `maxItems` constraint.
Source: [agent API](https://usenaive.ai/docs/api/agents.md), [session API](https://usenaive.ai/docs/api/sessions.md).

For progress, GET `/v1/sessions/{id}/stream?after_seq=N` or `/v1/sessions/{id}/events?after_seq=N&limit=100&include_accepted=true`.
Persist the last fully processed sequence and session ID in the backend, then serve application progress without exposing Naive credentials.
Always inspect the current session status, stop reason, pending actions, and structured result after a stream ends.
The SDK documents `client.stream(id, { afterSeq })` and automatic reconnect, but this experiment used raw SSE and explicitly reopened it.
Sources: [event API](https://usenaive.ai/docs/api/events.md), [SDK streaming](https://usenaive.ai/docs/sdk/streaming.md).

The npm registry reported `@usenaive-sdk/managed-agents` 0.12.3, ESM, Node >=20, and `zod` ^4.4.3.
An isolated installation under `/tmp/we-gotchu-agent-research/sdk` ran on Node v26.6.0 with install scripts disabled.
`createClient({ apiKey, baseUrl, fetch })`, `client.harnesses.list()`, and `client.sessions.get(id)` succeeded against the live account after cleanup.
The custom fetch copied request headers and set the explicit User-Agent.
The documented creation equivalents are `client.agents.create(body)` and `client.sessions.create(body)`.
Money in these APIs is integer micro-USD, whereas the proposed application contract uses integer currency minor units, so conversions must be explicit.
Sources: [SDK reference](https://usenaive.ai/docs/sdk/typescript), [SDK agents](https://usenaive.ai/docs/sdk/agents.md), [package metadata](https://registry.npmjs.org/@usenaive-sdk%2fmanaged-agents/latest).

## Monid discovery and search evidence

The installed Monid CLI was 0.1.9 and existing authentication worked.
No key setup, account signup, upgrade, global configuration change, provider feedback, or supplier write was performed.
Discovery queries included `venue search`, `product search`, and `google maps places`.
The broad venue query surfaced event-discovery endpoints, which are not equivalent to private venue rental availability.
The narrower Maps query found a suitable place-discovery tool.
Schemas and prices were inspected before running either selected endpoint.

| Search | Exact bounded input | Run and observed output | Reported cost |
| --- | --- | --- | --- |
| Channel3 `/v1/search` through Monid | Body `{"query":"paper plates pack 20","limit":2,"config":{"country":"US","currency":"USD"}}`. | `01M6W9RM4AKV6R2WPRCE3R1GFV`, COMPLETED, provider HTTP 200, two products. | $0.007. |
| Litescrape `/google/maps` through Monid | Query `{"q":"event venue San Francisco","type":"search","ll":"@37.7749,-122.4194,12z","start":0}`. | `01M6W9RPJG10HCFQQ607A7JJW1`, COMPLETED, provider HTTP 200, 20 place listings. | $0.00015. |

The product run completed at `2026-11-08T00:43:36.211Z`; the Maps run completed at `2026-11-08T00:43:43.055Z`.
Maps exposes a 20-place page rather than an inspected smaller result-limit parameter, so the test requested exactly one page and did not paginate.
The first Maps result was The Green Room, with a Google place ID and listing metadata.
This establishes discovery, not room capacity, private-event availability, rental price, or cancellation terms.
The product results included `UUL17us` and `Fvkg95r`, with merchant offers and indexed stock labels.
One result was explicitly a pack of eight despite the query asking for twenty, so quantity normalization must precede budget calculations.
No offer was opened in checkout, and no date-specific delivery promise, tax, shipping, or cancellation condition was verified.
The response included an affiliate-commission disclosure, which downstream presentation should preserve when using those links.
Sources: live Monid run IDs above, [Monid API](https://docs.monid.ai/api/overview.html), [Litescrape documentation](https://litescrape.com/docs).

## MCP options and limits

Monid documents Streamable HTTP at `https://mcp.monid.ai/v1` with account authorization through OAuth.
The existing CLI credential proving REST access does not prove a hosted Naive MCP connection or token refresh.
Source: [Monid MCP guide](https://docs.monid.ai/guide/quickstart-mcp.html).

Channel3 documents product search through `https://mcp.trychannel3.com` using a Channel3 Bearer key.
A direct Channel3 credential was not supplied or established in this evaluation; the successful Monid call does not establish possession of one.
Source: [Channel3 MCP guide](https://www.trychannel3.com/blog/channel3-mcp).

Litescrape documents `https://mcp.litescrape.com/mcp`, an optional Bearer key, and a keyless allowance for Google Maps and several search tools.
This is a promising direct venue-discovery alternative, but its MCP handshake, allowance, tool schemas, and Naive integration were not runtime-tested here.
Source: [Litescrape MCP guide](https://litescrape.com/docs/mcp).

Naive declares external servers as `mcp_servers: [{ type: "url", name, url }]` and permissions as `<server>.<tool>` entries.
Use public HTTPS and agent-scoped vault credentials rather than inline authorization headers.
A failed MCP connection can emit `session.degraded` while work continues, so the worker must fail the relevant research step instead of inventing evidence.
Custom client-executed callbacks are documented as coming soon; do not base the implementation on them.
Source: [Naive tools and MCP](https://usenaive.ai/docs/capabilities/tools.md).

The MCP specification defines `tools/list`, `tools/call`, input and optional output schemas, and structured results.
Tool annotations such as read-only hints are untrusted unless their server is trusted, so inspect behavior and enforce an application allowlist.
Source: [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools).

For the first implementation, prefer backend-controlled Monid research with only these inspected endpoints, then pass bounded evidence to Naive for ranking.
This uses an access path already tested and makes per-query costs and result normalization explicit, but adds backend orchestration.
Direct provider MCP would reduce that orchestration, but requires an integration test and provider-specific authentication or allowance verification.
Broad access to a generic Monid run tool permits more endpoints than these two and should not be treated as a read-only supplier allowlist.
This is a recommendation, not a change to the shared contract or an approved deployment design.

## Approval, payment, and recovery boundaries

The documented Naive `ask` policy parks a call with `awaiting_approval`, and `confirmTool` can allow or deny it with call scope.
No approval was requested, granted, denied, expired, or resumed in this test.
The observed message-based resume cannot stand in for those tests.
Before supplier execution, test a harmless read-only tool with `ask`, denial, call-scoped approval, stale decisions, and stream reattachment.
The application must still validate customer, event, plan revision, action arguments, amount, currency, revocation, and stable execution identity at the transaction boundary.
Sources: [Naive policy](https://usenaive.ai/docs/concepts/policies.md), [session SDK](https://usenaive.ai/docs/sdk/sessions.md), [shared contract](../contracts-draft.md).

The [supplier payments research](supplier-payments.md) remains the dependency record for collection, supplier funding, booking, cancellation, supplier recovery, and customer refunds.
This experiment did not test any of those mechanisms or change its live prerequisites.
Naive session cancellation is a runtime operation, not supplier cancellation.
A model result, search snippet, or completed tool call is insufficient evidence of a commitment.

## Proposed next spec and tickets

1. Tony and Ujjwal should agree a research-result schema before implementation, with brief revision, candidate source URL, provider reference, observed time, explicit unknown availability, estimate provenance, currency, cancellation-term status, and missing fields.
2. Tony should implement evidence normalization and candidate ranking against shared fixtures, with failing tests for unsupported budget claims, category URLs presented as exact venues, pack-size mismatch, stale evidence, missing terms, and a changed brief.
3. Tony should specify a bounded Naive research worker with durable session and sequence storage, one bounded correction for missing structured output, semantic validation, degraded-tool handling, and separate failure and awaiting-input states.
4. Ujjwal should provide the guarded execution interface and idempotency rules before any supplier mutation tool is exposed, while Tony adds harmless approval and resume integration tests.
5. The team should choose backend Monid access or direct MCP after a single authenticated end-to-end connector test, then keep unselected execution paths disabled.

The first three tickets can be specified now without live supplier access.
They should produce research candidates, not an executable EventPlan with invented totals or cancellation guarantees.
No application code or shared contract was implemented in this research branch.

## Exact blockers and cleanup

Structured-output reliability and recommendation quality remain blockers to accepting model output without server validation.
Approval/resume, budget exhaustion, forced disconnect recovery, crash recovery, and adversarial tool denial remain unverified.
Naive-to-Monid or direct-provider MCP connectivity and authentication remain unverified.
The shared schemas, transaction service, chosen supplier access, secure checkout, and supplier confirmation and cancellation evidence remain prerequisites for commitments.
The framework migration remains unresolved while PR #6 is open.

The agent spend endpoint returned HTTP 403 with the following error.

```json
{"error":{"type":"permission","code":"forbidden","message":"this API key is missing the `billing:read` scope","request_id":"req_g48yr1vndm0whd6g6a59p1swt7"}}
```
No broader credential or billing access was requested.
The reported Naive session usage and the two Monid run charges sum to $0.010133, but this is not a verified organization ledger total.
The configured Naive cap was accepted; cap enforcement at exhaustion was not tested.

Cleanup canceled the only Naive session and verified `status: "cancelled"` with `stop_reason: "interrupted"` through REST and SDK.
GET `/v1/agents/{id}/computer` returned null, so there was no observed computer to delete.
DELETE of the evaluation agent returned `deleted: true`, and a following GET returned HTTP 404.
The canceled session's evidence remains readable; Naive documents no session-delete operation.
Source: [session cleanup semantics](https://usenaive.ai/docs/api/sessions.md#cancel-a-session).
The two Monid runs are terminal COMPLETED records and did not provision persistent resources.
Temporary SDK dependencies were removed after validation; sanitized local snapshots remain under `/tmp/we-gotchu-agent-research` for this handoff and contain no credential values.
No server, watcher, browser, deployment, order, payment, supplier message, or active evaluation process remains from this research.

Verification for the documentation consists of ASCII checks, relative-link checks, embedded JSON parsing, whitespace checks, and review against the recorded runtime evidence.
The root package has no test script, and no application build or application test suite was run for this documentation-only change.
