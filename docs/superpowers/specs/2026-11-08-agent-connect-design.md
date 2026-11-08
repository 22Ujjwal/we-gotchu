# Arrange agent connection — controlled integration design

Owner: Ujjwal. Branch: `feat/agent-connect`. Baseline: `b986ab636725029fc6c1b694a1c34494a42a7bca` (cached main; no fetch of Tony's unpublished work).

## Intent

Let an external assistant use Arrange to plan an event, maintain its saved selections, and hand the customer to the same Arrange journey for inquiry approval and payment. Eventually the assistant can follow authoritative fulfillment evidence; the first increment must never imply a real booking where only research or payment exists.

Ujjwal requested a carefully planned independent feature, incremental tested commits, and progress in chat. Existing sandbox-only/no-real-outreach constraints still apply. Publishing a PR is a later decision after verification; this branch stays local initially.

## Approaches

1. Reuse Naive's internal `/api/mcp`. Rejected: its shared bearer identifies a trusted execution service, not a customer; exposing it to customer agents would mix privileges and privacy boundaries.
2. Separate customer-scoped gateway, backed by the current planning service. Recommended engineering choice: isolates access control and tool vocabulary while reusing durable service idempotency/ownership. Deliver a transport-independent core and a standard SDK MCP wrapper.
3. Full agent-to-agent delegation/payment autonomy. Deferred: more identity, budget, payment and supplier-evidence work than this increment can responsibly establish.

The working authority assumption is agent planning and tracking, with customer approval/payment in Arrange. This is an engineering default, not a claim that the user approved a new payment/outreach policy. No external tool may approve research exceptions, send mail, approve payment, execute supplier commitments or bypass a server guard.

## Deliverable and boundaries

Own new `src/server/agent-connect/**`, an isolated `integrations/arrange-agent-connect/**` package for the official MCP SDK, this design/plan, a focused team handoff and Ujjwal's status entry. Leave `src/server/planning/**`, internal MCP, shared DB/schema/migrations, frontend, root dependencies/config and generated routes untouched. The native worktree tool was unavailable; a sibling Git worktree preserves the established repository layout.

This is an integration candidate: no public app route or OAuth enrollment UI is mounted before Tony's integration and identity setup are ready. The module and SDK transport are callable/testable with injected dependencies. A deterministic local test backend is explicitly labeled a fixture; production code never silently falls back to it.

## Tools

- `arrange_get_capabilities`: names supported tools and authority limits.
- `arrange_start_event`: customer-scoped create with a stable request ID and natural-language brief.
- `arrange_get_event`: read the saved planning conversation and advance existing research polling through the existing service.
- `arrange_refine_event`: submit a follow-up with request ID and expected version.
- `arrange_toggle_selection`: explicitly toggle one saved option with request ID/version; follows the existing durable toggle contract rather than introducing an unsafe set-selection wrapper.

Every view includes a canonical customer review URL, planning status, saved version, selected options, source-backed proposal/unknowns, and an explicit statement that this result is planning evidence, not a confirmed booking. Trim responses to customer-facing fields: omit operator approvals, internal tool arguments, provider sessions, customer IDs and arbitrary runtime fields. Customer handoff URLs come from trusted server configuration, never from a client-provided host or supplier content. Limit transcript/proposal sizes; preserve explicit unknown/missing evidence rather than truncating it into certainty.

## Identity and permissions

The gateway receives a trusted access-token verifier, invoked for each request. It resolves a customer, client and grant ID, audience, expiry, revocation, scopes and optional allowed conversation IDs. Tool arguments cannot supply customer IDs or credentials. Fail closed if a verifier fails, token/audience/expiry is invalid, the grant is revoked, a scope is missing, or a conversation is outside the grant.

Provide a small hashed-token verifier for a controlled pilot, backed by an injected lookup (no embedded token registry or real credentials). Do not call this OAuth. OAuth-capable customer enrollment and grant storage are integration prerequisites for general availability; manually provisioned scoped tokens can support clients that accept explicit Authorization headers. Token issuer controls who may receive a customer grant. The old MCP_BEARER_TOKEN is never accepted by fallback.

Scope names: `arrange:read`, `arrange:plan`, `arrange:select`. Reads that advance existing research require the read scope; starts/refinements require plan; toggles require select. Conversation-restricted grants cannot create new conversations. Application ownership checks run in addition to grant restrictions.

A mandatory admission callback runs before application operations. Hosted integration must implement durable per-customer/client quotas and budget checks with idempotency-aware accounting. There is no in-memory rate-limit claim and no implicit allow-all production default. Existing Naive session cap stays unchanged. Public publication is blocked until this admission policy and token enrollment/revocation are wired.

## Existing planning bridge

Call `createPlanning`, `getPlanning`, and `commandPlanning` with request-bound dependencies whose `requireCustomerId` returns only the verified grant subject and whose `allowResearchReview` is false. Inject the repository and agent factory; never accept them over the wire. Namespace request IDs by grant ID using a fixed-length hash, making retries stable while preventing collision with UI or another client's IDs. Do not retry uncertain writes, and do not reinterpret an idempotency conflict as success.

Application operations may return busy/stale/uncertain states. Return a stable machine-readable error code and recovery direction without exposing internal exception strings. Uncertain states direct the agent to read the known conversation or customer support if creation outcome is unknown, never to invent a new request ID and resend.

## MCP/HTTP

Use the current official TypeScript SDK in an isolated checked-JavaScript (.mjs) package so root dependencies and root TypeScript file inclusion remain unchanged. Its own checkJs configuration and test command are required in addition to normal app checks. Use stateless Streamable HTTP with SDK-owned protocol handling and structured tool results. The wrapper authenticates each HTTP request before tools, validates origin against trusted configuration when supplied, bounds body size, and uses no process-global customer identity. MCP annotations describe side effects honestly: reading a conversation can poll/advance stored research, so it is not a pure database read.

A JSON command handler over the same core gives agents without MCP a documented HTTP integration seam; no separate workflow logic. Both handlers are factories, not a hosted route. No CORS wildcard with credentials. Responses are private/no-store. Unsupported or unavailable stages are explicit, not simulated success.

## Compatibility

Protocol support is not a claim that every named product accepts custom connectors. Grok's developer API documents remote MCP with explicit Authorization headers. Muse/Dot product identity and actual client setup remain unverified. Test with the official MCP client locally; add exact client setup recipes only when verified. Do not put provider credentials in URLs or example configs.

## Verification and milestones

1. Customer-scoped core, schemas, output redaction, request IDs, honest status and permission tests.
2. Existing planning-service bridge with local fake provider and durable repository test support; isolation, stale versions and replay tests.
3. Official SDK wrapper plus token/HTTP tests and a real in-process SDK client integration using fixtures.
4. Independent review, full application/coordination tests, typecheck, build, integration README and handoff.

Each milestone earns a small Conventional Commit after focused verification. No coauthor attribution. No mail/provider research/Stripe call, public deployment or production config change during this implementation. Final report separates implemented/local-tested/hosted/client-specific/booking evidence.

## Risks and explicit limits

General availability needs customer enrollment and durable grant/quota integration. Hosted route composition and future inquiry/offer/payment fields depend on Tony. A planning result can never certify a booking. The gateway is not a replacement for live supplier adapters. Provider compatibility and live client tests remain unverified until independently exercised.
