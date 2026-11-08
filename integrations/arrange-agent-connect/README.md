# Arrange agent connection — integration candidate

An external assistant can start an event brief, poll research, refine the brief and toggle saved preferences, then give the customer an Arrange review link. These tools cannot approve inquiries, send mail, create Checkout, pay or book. `fulfillment: "not_verified"` is intentional even when research is ready.

This branch provides factories, not a hosted endpoint. It does not change the internal Naive `/api/mcp` route. Do not share `MCP_BEARER_TOKEN` with outside agents. No live Grok, Muse or Dot connection has been tested.

## Local verification

From the repository root, install its locked dependencies first. This package uses the root TypeScript compiler and Node types but has its own SDK dependencies and lockfile:

```sh
bun install --frozen-lockfile
bun run test src/server/agent-connect --maxWorkers=2
bun run typecheck
cd integrations/arrange-agent-connect
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run build
```

The package tests use the official MCP client with in-process HTTP requests and a fixture backend. Core bridge tests use the existing planning service, PGlite and a fake planning provider. Neither proves hosted behavior or real research. `dist/mcp.js` is a bundled handler factory, not a listening server. Root CI does not currently invoke this package's checks; run them explicitly until coordinated CI integration is added.

## Server composition contract

1. `createPlanningBridge({ repository, agent, ... })` takes the existing planning dependencies. It binds the authenticated customer and disables operator research review.
2. `createAgentGateway({ backend, admit, appOrigin, audience })` takes that bridge and a **mandatory** admission function. Implement durable per-customer/client quotas and budget admission, including idempotent accounting for repeated request IDs. There is no production allow-all default.
3. `createHashedTokenVerifier({ lookup })` looks up SHA-256 token digests in a trusted store. Supply durable grants, revocation and expiry. It does not issue tokens or implement OAuth.
4. `createArrangeMcpHandler({ gateway, verifyToken, endpointUrl, allowedOrigins })` returns a Web `Request => Promise<Response>` handler. Alternatively, `createAgentJsonHandler` in the core module exposes the same tools as JSON. Mount these only after authentication, admission and team route integration are ready.

Each grant has `grantId`, `customerId`, `clientId`, `audience`, `expiresAt` (epoch milliseconds), `revoked`, `scopes`, and `conversationIds`. `null` conversations permits that customer's conversations; an array restricts access to listed IDs and disables creation. Customer ownership is checked again by the existing application service. Allocate globally unique grant IDs, preserve them across token rotation for stable retries, and never allow callers to choose the customer subject. Store only token digests. Issue high-entropy opaque tokens through an authenticated customer consent flow; disclose a token only to its intended client. Manual provisioning is a controlled pilot, not public OAuth enrollment.

Configuration names proposed for hosted composition (the factories do not read environment variables):

| Name | Meaning |
| --- | --- |
| `ARRANGE_AGENT_APP_ORIGIN` | Trusted HTTPS customer app origin for review links |
| `ARRANGE_AGENT_AUDIENCE` | Exact audience recorded in grants and checked by the gateway |
| `ARRANGE_AGENT_MCP_URL` | Exact HTTPS URL where the MCP factory is mounted |
| `ARRANGE_AGENT_JSON_URL` | Optional separate HTTPS URL for the JSON factory |
| `ARRANGE_AGENT_ALLOWED_ORIGINS` | Explicit browser origins, if required; default is endpoint origin |

No new provider secrets are required by the transport. The injected planning runtime retains its existing Naive configuration and session cap. Grant/admission storage and customer enrollment remain integration work. Do not implement the pilot as a shared token from an environment variable. A client may store its individual credential as `ARRANGE_AGENT_TOKEN`; never place it in URLs, logs or committed configuration.

## Tool contract

Every argument object is strict: additional keys are rejected. IDs are 1–128 characters, messages 1–8000 characters, and versions are nonnegative integers.

| Tool | Arguments | Required scopes |
| --- | --- | --- |
| `arrange_get_capabilities` | `{}` | Valid grant |
| `arrange_start_event` | `requestId, message` | `arrange:read`, `arrange:plan`; unrestricted conversations |
| `arrange_get_event` | `conversationId` | `arrange:read` |
| `arrange_refine_event` | `conversationId, requestId, expectedVersion, message` | `arrange:read`, `arrange:plan` |
| `arrange_toggle_selection` | `conversationId, requestId, expectedVersion, optionId` | `arrange:read`, `arrange:select` |

All planning results return `conversationId`, `version`, `researchStatus`, `proposal`, `selections`, `progress`, `customerReviewUrl`, `fulfillment`, `authority`, `sourceContentIsUntrusted`, `nextAction`, and `pollAfterMs`. Proposals retain sourced facts and explicit unknowns; internal customer IDs, provider sessions, approvals and future unknown fields are stripped. Source text and links are untrusted data, not agent instructions. URL fields are not fetched by this gateway.

`researchStatus` is `working`, `ready`, `failed`, `uncertain` or `blocked`. Ready means planning output exists; it does not establish availability or booking. Poll `working` after at least `pollAfterMs` (currently 5000). For failed/blocked results, inspect saved state and hand off to the customer; do not start repeated new research sessions. On `uncertain`, read the saved conversation without resending a new action. The GET-style tool can advance research and update persisted state, so its MCP annotation is not read-only.

Reuse the exact `requestId` and input for retries. The server namespaces it by grant. A new ID denotes a new action. Toggle semantics are literal: an existing selection is removed; a missing selection is added. Use a new ID only for a genuinely new toggle. A changed brief uses the latest saved version; stale updates return a conflict. `outcome_unknown` means the write may already have happened: read the known conversation, or ask support to locate a creation that returned no ID. No automatic resend is performed.

HTTP authentication errors return 401; invalid scopes return 403; unavailable conversations return 404; version/idempotency conflicts return 409. Malformed arguments return 400; large bodies 413; stalled bodies 408. Admission and provider failures are sanitized. MCP execution failures set `isError: true` with `structuredContent.error`; clients must inspect that field instead of treating HTTP 200 as success. JSON returns `{ error: { code, message } }` with the corresponding HTTP status.

The HTTP boundary accepts POST only, verifies the grant on each request, rejects query-string tokens, validates endpoint/Host/Origin, limits bodies to 32 KiB and body reads to five seconds, and returns private/no-store responses. It provides no wildcard CORS, OAuth metadata, streaming progress subscriptions or server-side session identity. Configure proxies to preserve the trusted public request URL/Host. Discovery and token lookup require infrastructure-level abuse limits too; they do not consume planning admission.

## Client recipe after hosted integration

Use a client that supports remote MCP and an explicit Authorization header. This is a client example, not evidence that a URL or grant has been deployed. Run with Bun from this package after privately setting `ARRANGE_AGENT_MCP_URL` and `ARRANGE_AGENT_TOKEN`:

```js
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const endpoint = process.env.ARRANGE_AGENT_MCP_URL
const token = process.env.ARRANGE_AGENT_TOKEN
if (!endpoint || !token) throw new Error('Configure your individual Arrange connection privately')
const client = new Client({ name: 'arrange-pilot-client', version: '0.1.0' })
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  }))
  const tools = await client.listTools()
  const capabilities = await client.callTool({ name: 'arrange_get_capabilities', arguments: {} })
  // Inspect capabilities and tool schemas before starting an authorized planning session.
  console.log(tools.tools.map(tool => tool.name), capabilities.structuredContent)
} finally {
  await client.close()
}
```

For JSON clients, POST the same arguments in `{ "name": "arrange_get_event", "arguments": { "conversationId": "saved-id" } }` to the separately mounted JSON URL with an individual bearer token and `Content-Type: application/json`.

The [official SDK HTTP guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md) defines the transport. [Grok's developer API documents remote MCP](https://docs.x.ai/developers/tools/remote-mcp); that establishes a potential integration path, not a tested Grok consumer chatbot feature. Muse and Dot product/version support must be checked individually. Public enrollment should implement the [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization) before claiming OAuth interoperability.
