# Verification runbook

## What each kind of check proves

Local controlled checks exercise application behavior and error cases.
Real SDK calls exercise the external provider integration.
Browser verification exercises what the customer actually experiences.
Hosted verification exercises the deployed configuration and runtime.
None substitutes for the other.

Use existing automated checks throughout.
For a reproduced bug, capture the failing behavior and add a focused regression before fixing it.
Do not spend time adding tests for documentation or mirroring implementation details.
Do not run paid research repeatedly when the failing component is a deterministic adapter or persistence bug.

## Preparation

Record branch, full SHA, clean or dirty status, environment, and who owns the running server.
Check for an existing suitable server before starting another.
Use the repository's `verify-we-gotchu` skill for the browser recipe.
Temporary servers must use `agent-process run` with a name, TTL and port, and the owner stops them afterward.
Do not erase shared records to get a clean test; use a fresh isolated conversation and database where appropriate.
Never include `.env.local` values or raw sensitive mail in an evidence bundle.

Use Bun 1.4.4 for continuity with the recorded local checks, or record the actual agreed version if changed.
Current package commands are:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run test
bun run build
node --test tools/team-coordination/*.test.mjs
git diff --check
```

Run the smallest relevant check while implementing, then the required suite and build once on the integrated shipping SHA.
CI currently runs frozen install, typecheck, tests and available coordination tests; build remains part of the local shipping check.
Re-read package scripts and CI at implementation time in case main has changed.

## Controlled quote fixture

Use a team-controlled inbox approved for the test, with no actual venue impersonation.
The email subject and UI evidence must label this a test quote.
Example reply:

```text
TEST QUOTE. This is a team-controlled integration test, not a supplier offer.
For your test event on December 12, 2026, noon to 3 pm America/Los_Angeles,
our fictional room can seat 12 guests.
Room hire is USD 120 and cleaning is USD 20.
No other venue fees or venue taxes apply in this fictional fixture.
The venue total is USD 140.
A USD 40 deposit is part of that total, not an additional charge.
The remaining USD 100 is due seven days before the event.
Cancellation at least seven days before the event returns the deposit.
This test quote expires on November 15, 2026 at noon America/Los_Angeles.
No reservation has been made.
```

Expected interpretation is a USD 140 venue quote with a USD 40 included deposit and an unresolved supply total unless separate evidence completes it.
Do not turn the venue quote into a USD 180 total.
Change the fixture dates when necessary; these are test inputs, not product defaults.
A separate clearly simulated supply fixture can complete stage-four testing without pretending to verify real shipping and tax.

## Stage-three transport checks, Ujjwal

1. Send once to the controlled inbox and record the provider reference.
2. Inspect the actual received message and compare recipient, subject and text.
3. Reply with the fixture and verify sender, thread and original-message reference.
4. Process the reply while the customer browser is closed.
5. Replay a sanitized event locally and confirm one logical inbound message.
6. Exercise uncertain send locally and confirm no blind second send.
7. Exercise unmatched thread and explicit provider rejection without touching real suppliers.

## Stage-three integrated browser checks, Tony and tester

1. Open a saved proposal and select a venue.
2. Generate the inquiry, edit one sentence, save, and reload.
3. Verify the draft and selected venue are unchanged.
4. Approve the exact controlled recipient and message once.
5. Verify the displayed status agrees with provider acceptance or delivery evidence.
6. Close the page, send the controlled reply, and wait for persisted processing.
7. Reopen the same conversation and inspect the quote, original-message reference and retained supply selections.
8. Reload and confirm no duplicated inquiry or quote.
9. Change the selected venue or material brief and verify the old draft cannot be sent as current.
10. Check a supplier question or incomplete quote does not become a complete payable offer.

An observed single click does not prove one server request or one provider send.
Use request records and provider references to establish that separately.
If capture is incomplete, mark duplicate-request behavior unverified.

## Stage-four checks

Use the same selected offer or a visibly simulated complete offer attached to the same customer journey.
Compare item IDs, quantities, currency, total, source offer revision and approved terms before Checkout.
Finish one sandbox payment and observe the signed webhook.
Verify the same linked event updates and restores after reload.
Change the offer and verify the prior approval cannot pay for the new version.
Verify missing required costs prevent approval instead of becoming zero.
Check duplicate webhook processing and abandoned Checkout using supported local or Stripe test mechanisms.
A payment confirmation must not say the venue is booked unless separate supplier evidence establishes it.

## Stage-five checks

Record the exact hosted commit and repeat the combined journey after deployment.
Use actual sign-in and the deployed webhook URLs.
Verify inbound processing while the tab is closed in the deployed environment, not only locally.
Record separate outcomes for research, follow-up, inquiry send, reply, offer, approval, payment and supplier execution.
Capture a genuine successful demo recording with private information removed.
Do not delay the demo indefinitely waiting for an external supplier reply.

## Stop and investigate

Stop dependent testing when the actual result does not match the expected state.
Keep the existing conversation and inspect its saved state and provider evidence before creating another run.
Record timestamps, exact request/session IDs, observed UI, sanitized errors and the last successful step.
For repeated provider failures, include HTTP status, provider error code, request ID, retry headers, affected operation and whether a write outcome is uncertain.
Do not resend an uncertain write under a different key or through another tool.
Fix the identified cause, repeat the smallest failing check, then rerun the affected browser path on the new SHA.
