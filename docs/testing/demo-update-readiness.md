# Demo update readiness, 2026-11-08

Branch: `fix/demo-live-updates`, based on photo branch head `5efbcc3`. This branch is local; it is not a deployment. Main was observed at `c920952fc7bf106b9ade5cc5c8a3b70c8f30ca20` after PR #77 merged. PR #78 remains the separate photo/UI PR.

## Implemented

- Ready conversations waiting for replies or reply interpretation refresh saved state automatically. Visible pages poll every five seconds initially, then every fifteen seconds after sixty polls. Hidden pages pause; focus/visibility resumes. Sixty consecutive failed saved reads stop retries until manual/focus recovery. Polling does not repeat email or payment commands.
- Recovery excludes idle awaiting-reply rows, non-ready replies, pending changes, payment-linked conversations and reserved follow-ups before applying its batch limit. This fixes starvation by an idle earlier conversation without retrying uncertain sends.
- Planning payment shows payment separately from simulated booking outcome and links confirmed matching payments to existing receipts.
- Receipts preserve simulation/test evidence, separate approval from confirmed payment, use paidAt and format zero-decimal currencies correctly.
- Local demo preflight reports missing names without values or external calls. Preview-fixture mode is rejected. The worker guide now correctly states recovery may send approved controlled mail.

## Live gates

The current local checkout has research configuration. It lacks company agent/identity/outcome IDs, tools secret, mail credentials/signing secret, controlled recipient, cron secret and Stripe configuration. The primary checkout has mail API/inbox and Stripe fields, but not the missing company setup, approved recipient or mail webhook secret. No credentials were copied or printed.

Vercel was observed to contain research, database, Clerk, AgentMail API/inbox and Stripe configuration names, but not company agent ID, tools secret or AgentMail webhook secret. Presence does not verify values, migrations, agent attachments or live authentication. Controlled sending and follow-ups still require development mode; do not bypass this guard to enable production outreach.

Before a live rehearsal, obtain the local configuration path and an explicitly approved independent team-controlled recipient. Configure one running local application, one database owner, a reachable agent tool URL and signed inbound webhook. Verify identity/outcome attachments. Run preflight, then one controlled inquiry/reply while the browser is closed. Reopen and verify the saved reply and offer. Sandbox Checkout requires its separate test-key/signature preflight. Do not substitute a return URL for signed payment evidence.

## Remaining recovery limitations

- A lost initial company-session creation response needs operator inspection; initial creation does not have the later reply-turn metadata reconciliation.
- Interrupted offer-ready notifications and needs_attention states are not automatically resumed by this queue.
- Failed or malformed company turns may still occupy a recovery slot. The idle-row fix is not a complete fair scheduler.
- The worker's 120-second HTTP timeout may expire during longer combined processing. Inspect saved state before another invocation; do not blindly resend.
- Final receipt email and a continuous live mail-to-payment run remain unverified. The new receipt link is an in-app artifact, not an email delivery claim.

No supplier contact, payment, provider configuration change, hosted migration or deployment occurred in this increment. Local tests and build do not establish hosted behavior. No fresh browser screenshot or live provider success is claimed.

## Verification

Final application suite: 807 tests across 75 files passed with `bun run test --maxWorkers=2`. Tooling: 35 tests passed. Typecheck and production build passed. Independent review covered polling, payment/receipts, recovery SQL and preflight; preview-fixture mode was reproduced and fixed.

The first full run had 806 passes and one existing database reopen test exceeding its five-second timeout while a build ran concurrently. That file then passed unchanged in isolation, and the entire suite passed unchanged on a rerun without the concurrent build. No timeout was increased.
