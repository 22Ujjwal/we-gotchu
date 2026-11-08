# Work handoff

## Identity

- Owner: Ujjwal.
- Feature and scope: stage-three isolated supplier-email transport; no planner, approval, payment, UI, shared schema or production configuration changes.
- Branch: `feat/supplier-mail-transport`.
- Base SHA: `d55646e37fce1b791e5be3ad456099888b604aaa`.
- Tested implementation SHA: `308110e60598b79d6cfe6b2c2ae4b9347d236499`. Subsequent handoff commit changes documentation only.
- Owned files: `src/server/email/supplier-inquiries/**`.
- Shared integration still required: durable operation/receipt repositories, application callback, runtime composition, `src/routes/api/supplier-mail.webhook.ts`, generated route tree, schema/migration owned by Tony.
- State: local commits only; not pushed, merged, deployed or connected to production.

## What changed

The exact approved inquiry can be submitted through a provider adapter that persists intent before sending, returns meaningful accepted/failed/uncertain states and preserves provider references. Repeated IDs cannot resend or substitute changed content. Reconciliation is read-only and stays uncertain when provider evidence is insufficient.

Inbound handling verifies Svix signatures, bounds body size/read time, durably retains raw evidence, deduplicates received messages, and awaits an application callback using a stable receipt ID. A lease prevents ordinary concurrent processing; the application must deduplicate its enqueue transaction to survive a crash after the callback effect. Conservative correlation requires an approved sender and unique provider references. Unsafe/unmatched replies and delivery evidence remain separate from interpreted offers.

Interface v1 exports and storage semantics are in [README.md](./README.md), [types.ts](./types.ts) and [incoming-types.ts](./incoming-types.ts). Required configuration names: `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `AGENTMAIL_WEBHOOK_SECRET`, and the existing `DATABASE_URL` for the application-supplied durable adapter. Proposed route: `POST /api/supplier-mail/webhook`. It is an integration template, not a registered or deployed endpoint.

Existing customer quote-ready notifications, research, transaction contracts and payments are unchanged. No dependencies added.

## Evidence

Environment: local isolated worktree on macOS; Bun 1.4.4. Verification on November 8, 2026, approximately 10:40–10:42 UTC. Fixtures use reserved example.com addresses, a fake fetch, test-only repository doubles and a public Svix test key.

| Check | Exact command or action | Result | Evidence location |
| --- | --- | --- | --- |
| Focused local check | `bun run test src/server/email/supplier-inquiries` | 49 tests pass | Five test files in this directory |
| Typecheck | `bun run typecheck` | Pass | Local command exit 0 |
| Required application suite | `bun run test --maxWorkers=2` | 566 tests across 50 files pass | Local command output; test files in repository |
| Coordination suite | `node --test tools/team-coordination/*.test.mjs` | 25 pass | Local command output |
| Vercel build | `NITRO_PRESET=vercel bun run build` | Pass; existing application builds | Ignored local `.vercel/output`; does not establish new route deployment |
| Whitespace | `git diff --check` | Pass | Local command exit 0 |
| Provider authentication | Read-only configured AgentMail inbox lookup using local credentials | HTTP 200; returned inbox matches configured identity | Prior local check; no secret values or raw inbox content retained here |
| Provider send/acceptance | Not run | **Unverified** | Approved controlled recipient not yet supplied |
| Actual recipient delivery and reply | Not run | **Unverified** | Requires controlled recipient/inbox access and reply |
| Signed hosted receipt with browser closed | Not run | **Unverified** | Local webhook secret missing; durable runtime/route not integrated |
| Browser/planner interpretation | Not run | **Unverified; Tony's integration** | No claim that local transport tests establish an interpreted offer |
| Payment/supplier commitment | Not run | Out of scope | No charges, purchases, bookings or supplier contact |

Local tests reproduce lost send responses, changed payload conflicts, concurrent sends, intent/result persistence failures, clear rejection, replayed receipts, duplicate event IDs for one message, crash after callback effect, invalid/stale signatures, request limits, missing inline bodies and unmatched sender/thread. A two-test regression caught the SDK's `send`/`reject` event payload names before the inbound commit. These tests establish local behavior, not live email or production database atomicity.

Independent read-only review approved the isolated adapter handoff with no critical, important or minor findings. Production database transactions, hosted setup, live delivery, application authorization and final offer interpretation remain the explicit integration obligations listed below.

## Integration instructions

Adopt in order (all share the base above):

1. `d8b5a73` — recoverable supplier inquiry sending and provider adapter.
2. `fbee081` — signed webhook verification.
3. `308110e` — durable reply receipt, normalization, deduplication and HTTP handler factory.
4. The subsequent documentation commit — this handoff and integration README.

No additional prerequisite branches are needed. Do not cherry-pick already adopted commits again. Full commit IDs are available from the local branch log.

Tony supplies the durable contracts exactly as described in README, including global request-ID uniqueness, atomic receipt insert/claim, fenced lease writes, and callback enqueue deduplication by receipt ID. Bind one request ID to each approved send. The callback owns application correlation, conversation state and interpretation; transport does not create an offer or approve content.

The concrete interface clarification is callback idempotency: after a crash, callback invocation can repeat even when one logical receipt exists. `acceptIncomingReply` must commit its dedupe key and job enqueue together. Never assume a JavaScript callback and a separate database update are a single transaction.

Mount the route after runtime composition and generate route types once in the integration branch. Configure the endpoint-specific Svix secret in an authorized nonproduction environment, then repeat deployed verification. Manual HMAC follows the provider-supported protocol without adding a root dependency. Neither this branch nor the build registers a provider webhook.

All listed automated commands use local fixtures and existing isolated test databases; they do not send mail or require live credentials. The separately approved live test will contact AgentMail and the explicitly named controlled recipient. Run one send only, inspect recipient receipt, reply with Tony's labeled TEST QUOTE, retain private provider references, and test signed delivery with the customer browser closed. Do not resend an uncertain operation.

## Limitations and cleanup

- **Live-test blockers:** no explicitly approved controlled recipient yet; `AGENTMAIL_WEBHOOK_SECRET` absent locally; durable repositories/callback/runtime/route await Tony. No credentials need to be posted in chat.
- AgentMail's organization-scoped idempotency window is 24 hours. The durable application intent must survive longer; do not delete it to retry.
- An uncertain send without a saved message ID cannot be automatically reconciled by this adapter. No read-by-idempotency-key capability was established. If acceptance persistence fails, returned references may require explicit operator recovery into the store.
- Repository implementations must be verified against a real isolated database after integration. Current repository doubles do not prove transaction/unique-index behavior.
- Provider delivery/bounce/sent/rejected evidence is retained; application display/status integration is still Tony's work.
- HTML-only replies may have no plain text. Original provider reference remains available; missing text is not evidence of a complete offer.
- Replays after provider retries expire need an application worker/operator path. This isolated module installs no background scheduler.
- Supplier text is untrusted data; quote interpretation and financial completeness remain outside transport.
- No application server, tunnel or background process was started. Test/build commands finished. Worktree and local branch are preserved for integration.
- No credentials, raw private mail, or real provider message/thread IDs were committed. No supplier contact, payment, purchase or production setting change occurred.
