# Stage three ownership and mail handoff

Status: proposed integration contract for Tony and Ujjwal to coordinate before shared edits.
This work extends saved planning conversations; the older event approval and customer-notification flow stays separate.
Stage-two review findings remain the implementation gate for the planning runtime.

## Tony's work

Tony owns the selected-venue inquiry draft, conversation commands, persistence, and customer review UI.
The draft records the chosen venue snapshot, the relevant customer requirements, a published recipient source or an explicit missing-contact state, subject, and message text.
The customer can edit and save the draft without sending it.
A changed selection or material customer request invalidates the old draft for sending until reviewed.
Tony owns mapping an incoming reply into an updated customer offer after the transport is verified.
No loader redesign or paper-slip activity work belongs in this stage.

## Ujjwal's work

Ujjwal owns the supplier-mail adapter and inbound receipt integration, plus its required deployment configuration.
Reuse the installed AgentMail integration where suitable, but do not change the existing quote-ready customer notification behavior.
Begin with provider capability checks and a controlled recipient approved for testing.
Verify actual provider send, message/thread identity, reply retrieval, webhook authentication, duplicate inbound events, and uncertainty behavior rather than inferring them from SDK types.
Use a separate feature branch and avoid planning contracts, conversation storage, planning routes, and frontend files until the handoff is coordinated.
Any new dependency, migration, or shared runtime edit needs an explicit file-level handoff to avoid overlapping changes.
Venue images can remain a separate PR if that assignment is already in progress.

## Proposed boundary

The planning service owns the customer authorization and durable inquiry state.
The mail adapter receives a frozen send input only after that service has accepted approval.

Send input:
- A stable request ID for the exact approved message.
- Conversation ID, inquiry ID, and draft revision for correlation.
- Recipient address, subject, and plain-text body.

Send output:
- Provider message ID and thread ID when returned.
- Provider acceptance timestamp when available.
- Acceptance means the provider accepted the message; it does not establish delivery or supplier agreement.

Inbound receipt:
- Provider event ID when available, message ID, thread ID, and reply-to message identity when available.
- Sender, recipients, subject, plain-text content, and received timestamp.
- A reference to retained original content for later inspection.

Use native provider references to correlate replies, not subject text alone.
The application must distinguish a duplicate inbound delivery from a new supplier message.
Do not automatically resend an uncertain write; return enough information to inspect existing provider records or keep the inquiry visibly uncertain.
Provider-specific retry and idempotency behavior must be verified before choosing recovery behavior.
Keep credentials and raw authenticated provider URLs out of customer responses and handoff documents.

## Demo and verification order

1. Tony verifies draft preparation, editing, stale-draft behavior, and reload locally.
2. Ujjwal verifies sending and receiving through a controlled inbox, including provider references and duplicate delivery handling.
3. Integrate one customer-approved test inquiry through the actual local UI and reload its saved status.
4. Receive a controlled reply while the customer tab is closed, then return and inspect the updated offer and original message.
5. Only after separate explicit recipient/message authorization, run a real-supplier inquiry and label its evidence separately.

## Remaining work after stage three

A priced supplier offer can later be bridged into the existing approval and Stripe sandbox flow.
That bridge must carry the customer's exact selected items, quantities, quoted costs, and revision; selection alone is not purchase authorization.
Ujjwal can inspect that mapping in parallel, but should not implement a speculative second transaction model before the inquiry and offer records settle.
Real supplier booking or purchase remains a separate integration requiring an actual accepted supplier action and confirmation.
Research caching and live activity slips remain deferred product improvements.
