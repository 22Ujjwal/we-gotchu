# Local journey rehearsal

This is a manual local verification procedure, not a cron job or deployment setup.
The controlled local model and sandbox payment checks have run; their results are in the [integration checkpoint](../../docs/handoffs/remaining-stages/local-integration-checkpoint.md).
The external mail reply check is deferred until a different team-controlled recipient is approved.
Do not create another self-send to substitute for that check.

## Start the application

Record the branch and full commit, check existing managed processes and port 3000, and reuse only a matching application instance.
Use the explicit development PGlite configuration from the existing verification skill.
Never open that database directory from another process while the application owns it.
Keep all provider credentials private.
Set the same private CRON_SECRET in the application and worker environment before starting either process.
The worker does not create or change that secret.

The application handles incoming mail at `/api/supplier-mail/webhook`.
A provider cannot reach localhost directly.
Real webhook delivery therefore needs an explicitly configured local forwarding connection or tunnel, plus a matching webhook signing secret.
No tunnel, webhook subscription or provider configuration is created by this procedure.
Without that setup, record actual inbound delivery as unverified.
A manually constructed signed payload tests the application handler but cannot prove provider delivery.

## Process replies with the browser closed

After approving the live check, start the application through agent-process as described in the project verification skill.
The following example uses Bun to load the existing local environment without printing values.
Use the installed Bun executable if `bun` is not on PATH.

```sh
NODE_ENV=development ~/.local/bin/agent-process run --name local-reply-worker --ttl 900 -- bun --env-file=.env.local tools/local-rehearsal/reply-worker.mjs 60
```

The runner calls the existing authenticated local endpoint sequentially, waiting five seconds between responses.
Each endpoint invocation resumes a pending arrangement and claims up to five durable reply jobs.
It can call the real interpretation and offer models.
The endpoint can also continue authorized supplier coordination and send customer notifications.
Use it only for the approved arrangement and recipients.
The runner never opens the database itself.
The output reports invocation number and claimed job count only.
A processed count is not proof of successful interpretation; inspect the saved reply status and original evidence afterward.
A failed or uncertain request stops the runner without retrying it.
Inspect saved state before restarting because a response can disappear after successful processing.
The default without an iteration argument is one invocation.
Retain the managed process ID and stop only that process after the check.

## Verify the complete journey

Use the inquiry and selected-offer recipes under `.codex/skills/verify-we-gotchu/features/`.
Keep one evidence record per conversation with exact code revision, action times, selected IDs, inquiry revision, reply identity, offer revision and linked event identity.
Do not copy authorization headers, cookies or credentials into evidence.

First verify saved research and selection through the actual signed-in application.
Approve only the exact controlled inquiry to the approved test address.
Use a different team-controlled recipient for the external reply check.
The earlier approved address was also the sending inbox, so that self-send is not independent recipient-delivery proof.
An incoming copy with the exact outgoing message ID must create no reply or interpretation job.
Record provider acceptance separately from inbox receipt.
Close the browser before the controlled reply arrives.
Run the local worker and verify the saved reply reaches ready without any customer page read.
Repeat the same signed webhook and confirm one durable receipt, one logical reply and one interpretation effect.
Reopen the conversation and compare the original reply and its interpreted facts.

Prepare a complete controlled offer and check every selected item, quantity, currency and amount.
For an included deposit, check that the total does not add the deposit again.
Keep an incomplete real offer incomplete.
Prepare the linked sandbox payment, approve once, and complete only an authorized Stripe test Checkout.
Payment proof requires the signed webhook and saved payment state, not the return URL.
Supplier execution must remain visibly simulated.
Reload the conversation and compare the linked event and payment.

A declined or abandoned Checkout can remain reusable.
Reconcile its provider state before another submission and record whether the same test session was reused.
Never submit again merely because the app still says pending.
Test changed selections before approval and while Checkout is open.
An invalidated payment must not commit suppliers and must enter the existing cancellation/refund handling.
A refund request is not proof of refund completion.
After cancellation settles, verify a revised offer can replace the old link without deleting transaction history.

## Current evidence and remaining gates

The combined application at `c18416fd37145864717498b09446d2dc5bf302e7` passed 629 application tests, 31 tooling tests, typecheck and build.
The payment browser check verified an explicit decline, abandonment and same-session reuse, successful sandbox payment, signed webhook redelivery and saved paid state after reload.
The app recorded exactly one simulated supplier action.
The self-send check verified acceptance, inbox receipt and exclusion of the outgoing-message echo from reply jobs.
A separate synthetic reply has a delivery receipt but no observed incoming-message webhook.
An independent external reply, browser-closed interpretation of that reply and a continuous mail-to-payment journey remain unverified.

Temporary provider endpoints and local signing overrides used for the checks were cleaned up.
Do not reuse a stopped forwarding URL.
Before another sandbox payment, run the payment preflight, verify the test key and endpoint signing secret privately, and confirm forwarding reaches the intended handler.
The payment recipe explains recovery without duplicate payment attempts.
No deployment is authorized.
The stage branches disable automatic previews and remain separate PRs.
