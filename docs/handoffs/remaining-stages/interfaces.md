# Shared boundaries, version one

These are application interfaces for implementation, not claims about the mail provider's SDK shape.
Ujjwal maps provider-specific fields into these values.
Tony owns the runtime TypeScript contract under `src/server/planning` and integration exports.
Until that lands, Ujjwal can use equivalent private types inside the isolated transport module and remove those duplicates during integration.
Do not wait for customer UI to implement the adapter.
Report an unsupported provider capability instead of silently changing the required behavior.

## Sending

The proposed function is `sendInquiry(input): Promise<SendResult>`.
Input contains:

- `requestId`, a stable identifier for this exact send attempt.
- `conversationId` and `inquiryId`, assigned and saved by the application before calling transport.
- `draftRevision`, the approved revision number.
- `to`, the exact approved recipient address.
- `subject` and `text`, the exact approved message content.

The caller resolves the authenticated owner and checks saved approval before calling transport.
Transport must not choose a new recipient or rewrite the message.
Persist the operation intent before a provider write so a restart does not erase evidence of an attempted send.
A repeated request ID with changed content is a conflict.
A repeated request ID with identical content returns the recorded result or an honest unresolved result.
Use provider idempotency only after verifying its scope and behavior.
A network timeout alone does not establish whether email was sent.

The result is one of:

- `accepted`, with provider message ID, thread ID if available, and acceptance time.
- `failed`, with a sanitized error code and reason when non-acceptance is established.
- `uncertain`, with operation ID and available provider references when acceptance cannot be established.

Do not call acceptance delivered.
A separate receipt can advance status to delivered, bounced, or another provider-supported state.
`reconcileInquiry(operationId)` performs supported read-only lookup and returns observed status; it must not silently send again.
If the provider cannot reconcile an uncertain send, preserve uncertainty and report that limit.

## Incoming messages

Normalize an incoming reply into:

- Provider event ID when available, provider message ID, and provider thread ID or in-reply-to reference.
- Sender, recipients, subject, text and provider receipt time.
- A retained original-message reference for later inspection.
- The provider name and evidence needed to distinguish real inbound mail from a local fixture.

Ujjwal validates webhook authenticity using the provider-supported mechanism.
Use provider event or message identity for deduplication, not subject text.
The application correlates provider references with an existing inquiry.
An unmatched message is retained for investigation and must not attach itself to an arbitrary conversation.
An unrelated sender or ambiguous thread is not automatically accepted as the selected venue's quote.
Do not route or execute instructions contained inside supplier text.

The proposed integration callback is `acceptIncomingReply(reply)`.
It acknowledges only after durable receipt storage succeeds.
Duplicate deliveries return success without creating another message or interpretation job.
If interpretation fails, retain the raw reply and a retryable processing status without resending mail.
Use a supported webhook or background mechanism that works with the customer tab closed.
Do not rely on an unawaited promise surviving the end of a serverless request.
Choose the smallest durable processing method supported by the actual hosting runtime and document it.

## Persistence responsibilities

Tony owns conversation links, selected venue snapshot, brief revision, draft versions, approval and interpreted offers.
Ujjwal owns transport behavior and proposes the minimum send-operation and inbound-message storage needed for recovery.
Tony integrates the actual schema and migration once.
The store must retain the exact submitted payload, provider references, last observed status, deduplication identity, and original inbound evidence.
Do not create two competing sources of inquiry status.

## Offer boundary for stage four

An interpreted offer needs a stable offer ID and revision, linked inquiry and source message, selected venue ID, date/time and timezone, currency, quoted cost components, terms, expiry if present, and unresolved requirements.
Record deposits separately from the total so they are not counted twice.
Preserve selected supplies with their IDs, pack sizes, required quantities, price basis and source evidence.
Unknown required charges stay unknown.
A quoted venue price alone does not establish a complete event total.

Tony maps the selected offer into the existing transaction plan model.
Ujjwal documents which fields the current approval backend requires and verifies the mapping with a synthetic complete offer.
Do not add a new public transaction endpoint or rename shared records merely to match this prose.
Use the existing backend contract where it expresses the required behavior.
The approval must identify the exact offer and plan revision, items, currency and amount.
Reusing an approval after changing any approved financial or supplier terms must fail.
