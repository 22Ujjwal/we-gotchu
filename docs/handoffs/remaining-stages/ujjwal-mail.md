# Ujjwal's stage-three mail work

## Goal

Prove that an approved application message can be sent once, its reply can be received without an open browser, and both can be tied to the same inquiry.
This work should run independently of the planner and customer UI.

## Inspect first

Read `src/server/email/quote-ready.ts` and the installed `agentmail` package.
The current customer notification uses `AGENTMAIL_API_KEY` and `AGENTMAIL_INBOX_ID` and calls `inboxes.messages.send`.
That existing code is evidence of a configured integration path, not proof that inbound delivery or idempotency works for inquiries.
Verify actual SDK and provider documentation before relying on those capabilities.
Do not print or send secret values.

Record whether a sending inbox exists, whether the controlled recipient is authorized, how replies are fetched or delivered, which references correlate them, and how webhook authenticity is checked.
If credentials or recipient approval are missing, continue adapter implementation and controlled local checks; report live verification as blocked.
Do not claim fake responses establish provider readiness.

## Implementation sequence

1. Add the isolated transport module and factory with injected provider client and operation repository.
2. Map the send boundary from `interfaces.md` into the existing SDK.
3. Save and return provider references and meaningful failure states.
4. Implement read-only reconciliation where supported.
5. Normalize inbound messages and verify webhook authenticity.
6. Deduplicate inbound receipt and call the injected application callback after correlation information is available.
7. Add the thin webhook route and document required runtime configuration names.
8. Hand Tony the minimum shared migration and runtime wiring requirements.

Keep the adapter callable from a small local script or focused integration check without a browser or planner session.
Do not add a second mail vendor unless the current provider demonstrably cannot perform the required operations and the change is agreed.
Do not modify quote-ready notifications or payment code in this feature branch.

## Isolated acceptance

Use the approved team-controlled inbox as the recipient.
Send one message containing a unique test inquiry reference.
Check the recipient inbox, not just the SDK return value.
Record the message and thread references without publishing private content.
Reply with the controlled quote from the verification runbook.
Verify the normalized reply retains the source text, references, and receipt time.
Prove it reaches the receiver while no customer browser is open.

Replay a captured sanitized inbound event locally to verify one logical receipt and one callback effect.
Simulate a lost send response locally and verify the application does not send a second message automatically.
Exercise a clear provider rejection and an unmatched reply.
A duplicate provider webhook must not create a second interpreted offer after integration.
Do not create real provider failures or spam inboxes just to exercise error handling.

## Handoff

Provide the adapter commit before route/runtime integration so Tony can adopt the interface separately.
List the actual exported functions, storage requirements, route path and configuration names.
Include sanitized send/receive evidence, the exact tested SHA, commands, and unsupported provider behavior.
Mark receipt, delivery and reply as separate observations.
The task is complete only when the controlled real send/reply succeeds or its external blocker is explicit; passing fake-client tests alone is not completion.
