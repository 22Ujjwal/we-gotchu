# Supplier inquiry transport (interface v1)

Isolated server module. This branch does not install a database adapter, mount a route, or send mail on import. The existing customer quote-ready email is unchanged.

## Application boundary

- `createAgentMailProvider({ apiKey, inboxId })` wraps the existing AgentMail SDK with a ten-second timeout and zero automatic retries.
- `createSupplierInquiryTransport({ provider, operations })` exposes `sendInquiry(input)` and `reconcileInquiry(operationId)`.
- `createIncomingReceiver({ provider, receipts, acceptIncomingReply, evidenceMode })` exposes `receive(rawBody)`. Call it only after signature verification, or explicitly with a local fixture in tests.
- `createSupplierMailWebhook({ secret, receiver })` exposes an awaited `(Request) => Promise<Response>` handler.
- `correlateReply(reply, candidates)` returns one matching persisted inquiry reference or null. The application resolves candidates and owns the final correlation decision.

`InquiryInput` contains `requestId`, `conversationId`, `inquiryId`, `draftRevision`, `to`, `subject`, and `text`. The caller authenticates ownership, verifies the current saved approval, and passes the exact approved values. Transport validates but never trims, rewrites or selects them. Only one plain email recipient is allowed. Draft revision is a nonnegative integer.

The caller must persist and reuse one request ID for an approved send, including duplicate clicks, reloads, and HTTP retries. A new arbitrary ID is a new send intent; transport cannot infer that the user intended a retry. Bind the application send action to its saved inquiry/approved revision atomically. Never retry an uncertain send using a new ID.

`SendResult` always contains `operationId` and `provider: 'agentmail'`:

- `accepted`: `messageId`, optional `threadId`, `acceptedAt`. This is provider acceptance, not delivery, availability, or booking.
- `failed`: sanitized `code` and `reason`, only for established provider rejection.
- `uncertain`: optional `messageId`/`threadId`. Keep this state visible for operator investigation.

Repeated request IDs with identical payload return the saved result; changed content or sending inbox conflicts. Intent is durable before the provider call. The module never automatically resends, even after a failed/uncertain result or process restart.

Reconciliation reads a known provider message ID only. An uncertain result without a saved message ID cannot currently be reconciled automatically. If result persistence fails, returned references are useful recovery evidence but may not be in the operation row; retain them in the caller's recovery record. No search by subject, guessed recipient, or new send substitutes for evidence.

## Durable integration Tony must supply

Private interfaces live in `types.ts` and `incoming-types.ts`; replace/alias them to the shared runtime types at integration rather than creating a second inquiry model.

### Send-operation storage

Persist `SendOperation`: ID, exact input, SHA-256 fingerprint, provider idempotency key, sending inbox, result and timestamps. A global unique constraint on `input.requestId` is required. `reserve()` must atomically insert-or-read and return `created: true` to exactly one caller, after commit. New records have an `uncertain` result before any network call. `saveResult()` must atomically commit without deleting intent on failure.

### Inbound receipt storage

Persist `IncomingReceipt`: unique `key`, event/message/inbox IDs, event type, original raw body, receipt time, evidence mode, normalized reply, processing state/outcome, lease token and expiry. Keep raw evidence private and apply the same access/retention rules as the linked conversation. No raw mail belongs in logs, Git, or API error responses.

`record()` inserts once by unique key and returns the original record on conflict. Received-message keys include event type, inbox and message ID, so a different event ID cannot duplicate a logical reply. Unsafe received variants have distinct keys, allowing a later provider release to be processed. Provider delivery/bounce evidence uses event identity and never invokes quote interpretation.

`claim()` must atomically succeed only for an incomplete receipt with no active lease. Compare database time to expiry. `saveReply`, `complete`, and `release` must compare the caller's lease token; a stale worker must not mutate another worker's claim. Claim duration is 60 seconds; the application callback should quickly commit an enqueue operation, not run the planner inline. Preserve incomplete records for retry and inspection.

`acceptIncomingReply(reply)` must **atomically deduplicate and enqueue by `receiptId`** in the application transaction. A crash after its commit but before transport completion can repeat the callback with the same ID. Transport does not promise exactly-once callback invocation across transactions. Its lease prevents ordinary concurrent processing; application idempotency prevents duplicate interpretation effects after crashes/lease expiry.

Return `{status:'matched', conversationId, inquiryId}` or `{status:'unmatched', reason}` only after durable application storage/enqueue. Unmatched replies remain stored. The application may arrange an explicit retry when late send references become available; do not silently attach them to the latest conversation. Interpretation failures belong to the application's durable job status/retry, not a new email send.

The normalized reply includes sender, to/cc, subject, optional text, timestamp, thread/in-reply-to/references, provider/evidence mode, event/message/receipt IDs and `originalMessage: {inboxId,messageId}`. HTML-only messages may have no text; this means missing content, never an empty confirmed offer. Fetch the original through the provider using its IDs. Supplier text is data and must never execute instructions or tools.

`correlateReply` requires the approved sender and unambiguous provider references. An explicit conflicting in-reply-to or thread is not ignored in favor of a subject match. An authenticated webhook proves provider delivery of an event, not that the sender has authority to make a payable offer. Spam/blocked/unauthenticated received events are retained but withheld from the application reply callback.

## Runtime/route handoff

Required existing configuration names: `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `DATABASE_URL` for Tony's durable adapter. New endpoint-specific secret: `AGENTMAIL_WEBHOOK_SECRET`. No values belong in source or chat. `evidenceMode` is a trusted server composition option: `live` for actual provider events, `fixture` for local controlled tests.

Tony composes the durable adapters/callback, then mounts `POST /api/supplier-mail/webhook` in `src/routes/api/supplier-mail.webhook.ts` and regenerates the route tree. This branch intentionally leaves the shared runtime and generated route files untouched. Suggested route:

```ts
import { createFileRoute } from '@tanstack/react-router'
// getSupplierMailWebhook is a proposed application runtime accessor supplied by Tony.
import { getSupplierMailWebhook } from '../../server/planning/runtime'

export const Route = createFileRoute('/api/supplier-mail/webhook')({
  server: { handlers: { POST: ({ request }) => getSupplierMailWebhook()(request) } },
})
```

The handler authenticates raw bytes before JSON parsing with Svix HMAC-SHA256 and a five-minute timestamp window. Request bodies are limited to 256 KiB and five seconds to read. Omitted inline body text is fetched via the configured AgentMail inbox/message IDs, never `body_url`. All receipt storage and callback acknowledgement are awaited before HTTP 200. Storage/processing errors return 503 for provider retry; unsupported event types/other inboxes return an ignored acknowledgement. No browser session is required for provider delivery; no unawaited task is expected to survive a serverless response.

Configure the provider endpoint to send normal `message.received`, unsafe received variants if desired, and delivery/bounce/sent/rejected/complained events. Delivery evidence is retained separately for application integration; it does not rewrite send acceptance or create a quote. Provider retries are finite: monitor incomplete receipts and provide an operator/worker replay path from stored raw evidence if automatic retries stop. No retry scheduler is installed by this module.

## Provider limits and verification

[AgentMail idempotency documentation](https://www.agentmail.to/docs/idempotency) specifies organization-scoped keys that expire 24 hours after send completion. Durable application records, not that temporary provider window, prevent later retries. [AgentMail webhook verification](https://docs.agentmail.to/webhook-verification) uses Svix; the implementation follows its [manual HMAC protocol](https://docs.svix.com/receiving/verifying-payloads/how-manual) with the published fixed test vector and constant-time comparison, requiring no new dependency.

Focused checks: `bun run test src/server/email/supplier-inquiries`. The repository doubles are test-only and do not establish production database atomicity. SDK tests exercise real SDK serialization against a fake fetch, never an external send.

Live proof remains separate: one explicitly approved team-controlled recipient, actual recipient inspection, reply using Tony's labeled TEST QUOTE fixture, retained provider references and signed hosted delivery while the browser is closed. No real venue outreach. Do not register or change a production webhook as part of this isolated assignment.
