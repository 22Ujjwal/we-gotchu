# Naive and OpenAI compatibility research

Checked on 2026-11-07 against public primary sources.
This is a draft research handoff, not an implementation decision or proof of account access.
The scope follows [the glossary](../../GLOSSARY.md), [the stack proposal](../stack-proposal.md), [ADR 0002](../adr/0002-limit-hackathon-scope-and-require-action-approval.md), and [the research ticket](../../.scratch/event-demo/issues/01-naive-openai.md).
No authenticated provider requests, model runs, transactions, signups, secret reads, or messages were performed.

## Recommendation

Evaluate `@usenaive-sdk/managed-agents` with the hosted `pi` harness for the Naive portion of the event workflow.
The official SDK reference names this package, and the capability matrix documents approvals, structured results, and incremental text output for `pi`.
This combination best matches the proposed approval and progress requirements, but its behavior remains untested in the team's account.
Sources: [TypeScript SDK](https://usenaive.ai/docs/sdk/typescript), [harness capabilities](https://usenaive.ai/docs/concepts/harness-capabilities.md).

Do not promise that the team's OpenAI credits fund Naive model calls.
The documented Naive model proxy uses a Naive key and bills the Naive organization's balance, even when called through an OpenAI-compatible SDK.
I found no documented OpenAI BYOK configuration in the reviewed agent, router, proxy, SDK, or billing references.
That is a documentation gap, not proof that a private commercial arrangement cannot exist.
Sources: [model proxy](https://usenaive.ai/docs/api/proxy.md), [agent API](https://usenaive.ai/docs/api/agents.md), [Naive billing](https://usenaive.ai/docs/platform/billing.md).

## Package and execution

The public npm registry reported `@usenaive-sdk/managed-agents` version `0.12.3`, ESM format, Node.js `>=20`, and a runtime dependency on `zod` at review time.
Pin that version for a later evaluation rather than assuming an unversioned installation matches this report.
Source: [publisher package metadata](https://registry.npmjs.org/@usenaive-sdk%2fmanaged-agents/latest).

The SDK is a typed API client constructed with `createClient`, a `baseUrl`, and a Naive `apiKey`.
The reference uses `https://api.vetta.sh`, explains the remaining Vetta identifiers, and directs users of `@usenaive-sdk/vetta` to change their package import to `@usenaive-sdk/managed-agents`.
Sources: [SDK reference](https://usenaive.ai/docs/sdk/typescript), [documentation overview](https://usenaive.ai/docs).

The application calls `agents.create` and `sessions.create`; Naive executes the agent loop on its infrastructure.
The runtime commits transcript and cursor state between turns and describes recovery from the last committed turn, with up to one turn lost.
This is not a guarantee that an external supplier action executes exactly once.
Sources: [overview](https://usenaive.ai/docs), [runtime durability](https://usenaive.ai/docs/concepts/runtime.md).

All four documented harnesses are hosted; the matrix explicitly says there is no local harness today.
`pi` is GA and uses a sandbox, while `vetta` is an organization-gated isolate preview without incremental text deltas and with a documented structured-output implementation gap.
`claude_code` and `hermes` do not support approval pauses, so they do not meet this workflow's approval requirement.
Check `GET /v1/harnesses` in a separately authorized evaluation because deployment availability is authoritative.
Source: [harness capability matrix and known gaps](https://usenaive.ai/docs/concepts/harness-capabilities.md).

The application backend can control hosted sessions without keeping the customer's browser request open for the full workflow.
This is an architectural recommendation based on the documented hosted execution and resumable event interfaces, not a tested deployment claim.
Sources: [runtime](https://usenaive.ai/docs/concepts/runtime.md), [streaming](https://usenaive.ai/docs/sdk/streaming.md).

## External tools

Naive documents built-in tools, connected-account tools, and external MCP servers declared through `mcp_servers`.
MCP tool permissions use names such as `<server>.<tool>`, with explicit per-tool configuration and approval gates.
Credentials are injected server-side through vault references rather than inline secret headers on agent definitions.
Use a public HTTPS MCP endpoint; localhost and private network addresses are refused.
Source: [tools and MCP configuration](https://usenaive.ai/docs/capabilities/tools.md).

The same reference lists organization-defined, client-executed custom tools as coming soon.
Do not design the handoff around an assumed callback that emits a local tool request and accepts its result.
For Monid, AgentMail, or application-owned supplier operations, an MCP adapter is a possible integration design, but the actual endpoint, authentication, schemas, and provider behavior still require separate verification.
An MCP connection failure can produce `session.degraded` while the agent continues, so missing research tools must not silently become fabricated supplier results.
Source: [external tool support and limitations](https://usenaive.ai/docs/capabilities/tools.md).

## Approval and cancellation contract

With `permission: "ask"`, Naive holds the tool, emits `tool.confirm`, and parks the session as `idle` with `stop_reason: "awaiting_approval"`.
The policy reference records the answering user or API key as the approver.
Source: [policies](https://usenaive.ai/docs/concepts/policies.md).

The pending call includes its tool-call ID, tool name, and arguments in `pending_actions`.
After the final pending action is answered, the session resumes automatically; denial prevents that held call from executing.
Source: [official approval guide](https://usenaive.ai/blogs/how-to-add-human-approval-to-an-ai-agent).

`sessions.confirmTool` accepts `tool_call_id`, `decision`, optional `reason`, and optional `scope`.
Omitting scope or using `"call"` approves one call; `"session"` grants the tool for later calls in that session.
Use call scope for supplier commitments and payments because session-wide grants do not bind future arguments to the customer's event plan.
Questions use `sessions.answer`, not tool confirmation.
Source: [session SDK](https://usenaive.ai/docs/sdk/sessions.md).

Proposed application contract: bind each approval to the customer, event, plan revision, exact action arguments, currency, total, cancellation limits, Naive session ID, and tool-call ID.
One customer approval may cover the specified venue booking and item purchase, but the backend must match each pending call against those approved actions before confirming it.
Record the customer identity separately when the Naive audit principal is the application's API key.
These are application requirements derived from ADR 0002, not capabilities that Naive's generic confirmation API establishes automatically.
Sources: [ADR 0002](../adr/0002-limit-hackathon-scope-and-require-action-approval.md), [confirmation API](https://usenaive.ai/docs/sdk/sessions.md).

The transaction owner should enforce approval validity and duplicate prevention again at execution, including rejection after cancellation or a plan revision.
Deny unnecessary shell, browser, and other write paths so they cannot bypass the approved supplier operation.
Naive's `sessions.interrupt` stops a turn, while `sessions.cancel` ends the session permanently; neither establishes a supplier cancellation or refund.
Retain separate provider-backed results for each booking, purchase, cancellation, and refund.
Sources: [ADR 0002](../adr/0002-limit-hackathon-scope-and-require-action-approval.md), [session operations](https://usenaive.ai/docs/sdk/sessions.md), [tool policy](https://usenaive.ai/docs/concepts/policies.md).

## Progress and reconnection

`client.stream(sessionId, { afterSeq })` consumes SSE and resumes after an exclusive sequence cursor.
It reconnects after dropped connections, with five consecutive reconnect failures allowed by default, and filters previously delivered sequence numbers.
Events include message deltas, tool start and completion, confirmation requests, usage, degraded operation, and session lifecycle changes.
Source: [streaming reference](https://usenaive.ai/docs/sdk/streaming.md).

Persist the session ID and last processed sequence in application storage, and re-serve progress through the backend so the Naive key never reaches the browser.
The generator normally ends at `session.idle`, including an approval pause, so stream completion must not mean the event workflow has finished.
Reattach after approval or new input, and interpret `stop_reason` before choosing a customer-facing state.
Polling through `sessions.events` is an alternative, with `includeAccepted: true` needed for some event types included by SSE.
Source: [streaming lifecycle and polling](https://usenaive.ai/docs/sdk/streaming.md).

## OpenAI models and credited accounts

Naive's model catalog is live and paginated, and its router filters for text output, tool calling, and published token prices.
Verify the intended model ID through `GET /v1/models` or its retrieval endpoint before selecting it.
The immediate lane supports cataloged models, while other completion windows require explicit model support.
An OpenAI-branded model name does not establish which account pays or which inference host serves it.
Source: [model routing and catalog](https://usenaive.ai/docs/concepts/model-router).

The documented Chat Completions proxy is a Naive billing route, not documented OpenAI BYOK.
It is also not complete OpenAI API compatibility: the reference documents rejected parameters, ignored temperature, and Chat Completions rather than a general Responses API passthrough.
Source: [proxy contract](https://usenaive.ai/docs/api/proxy.md).

OpenAI's official JavaScript package is `openai`, and it supports direct server-side Responses API calls with an OpenAI API key.
OpenAI attributes requests to the applicable organization and project; its API overview documents explicit organization and project headers for relevant credentials.
Sources: [OpenAI SDK](https://developers.openai.com/api/docs/libraries), [authentication and attribution](https://developers.openai.com/api/reference/overview).

OpenAI documents that API usage consumes applicable API credits and uses free credits before purchased credits.
Credit expiration, organization access, model access, rate limits, and spend limits remain separate constraints.
ChatGPT and API billing are separate, although eligible subscriptions may offer an API credit grant that must be activated for a linked API organization.
Neither a subscription nor the phrase "OpenAI credits" proves that this team's intended requests are covered.
Sources: [prepaid API billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing), [API credit benefit](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions), [API limits](https://help.openai.com/en/articles/6614457-troubleshooting-api-usage-and-spend-limits).

The simplest documented route to using an eligible credited OpenAI API account is a direct OpenAI call attributed to that account.
A hybrid design could keep Naive for hosted research and use a separate application-owned OpenAI step, but that would add orchestration and separate usage records while leaving Naive's own charges intact.
An entirely application-run OpenAI workflow would require its own durable execution and approval implementation and would change the proposed Naive integration.
These are alternatives for the parent to decide, not implemented solutions or evidence of hackathon eligibility.
Sources: [OpenAI libraries](https://developers.openai.com/api/docs/libraries), [Naive runtime](https://usenaive.ai/docs/concepts/runtime.md), [Naive billing](https://usenaive.ai/docs/platform/billing.md).

## Evidence gaps and handoff

The older stack-proposal blog URL now redirects to an approval guide whose organization-default policy description conflicts with the current policy reference, which says policies live on each agent.
Use the current policy and SDK references for the draft contract, and verify the behavior before relying on it.
Sources: [redirected guide](https://usenaive.ai/blog/how-to-build-an-agentic-access-governance-platform), [current policies](https://usenaive.ai/docs/concepts/policies.md).

Billing and runtime pages also differ in their descriptions of paused-computer charges, so this report makes no exact idle-price promise.
Sources: [runtime storage description](https://usenaive.ai/docs/concepts/runtime.md), [billing description](https://usenaive.ai/docs/platform/billing.md).

- The agent-workflow owner still needs to verify account access, runnable `pi`, the selected model, MCP connectivity, denial, resumption, and reconnect behavior in a separately authorized test.
- The account owner still needs to establish the OpenAI credit grant's organization, balance, expiration, eligible services, project access, and intended model access without sharing secrets in handoff documents.
- Naive BYOK remains unconfirmed and requires an explicit supported configuration and billing evidence before the team can promise credit compatibility.
- The transaction owner still needs to define exact-action approval, cancellation-before-execution, duplicate prevention, and provider-evidence contracts.
- The frontend owner can draft progress and approval interfaces against those contracts, with `idle` and approval-waiting kept distinct from completed supplier work.

The documentation supports a Naive hosted-runtime evaluation, but account compatibility and live execution remain blockers to a production or live-demo claim.
This research stops at the draft handoff and does not resolve the parent map or ticket.
