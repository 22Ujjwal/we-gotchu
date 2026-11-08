# Ujjwal's status

Owner: Ujjwal.
Updated: 2026-11-07T21:34:11-08:00
Baseline and hosted test commit: `5b180cc8c57c85c876852579cf448f9cbc7c627a`.
Branch: [docs/neon-setup](https://github.com/22Ujjwal/we-gotchu/tree/docs/neon-setup).
PR: [#43](https://github.com/22Ujjwal/we-gotchu/pull/43), status documentation only; not merged.
Availability: backend, DOM harness (#39), and connected journey (#41) merged. Hosted database, sign-in, event persistence, and direct MCP verified. Stripe sandbox delivery is verified; successful research and a full test-payment/refund flow remain pending.

## Current hosted result

- App: https://we-gotchu.vercel.app
- MCP: https://we-gotchu.vercel.app/api/mcp
- Production deployment: `dpl_VBqk4P8Bf7xuYThecVACzXsjN6cQ`, READY, serving the full baseline SHA above (rechecked 2026-11-08T05:01Z).
- Neon: `we-gotchu-db`, Free (`free_v3`), iad1; production DATABASE_URL configured. Neon Auth disabled because customer authentication uses Clerk.
- No application code, public contract, or migration is changed by this handoff.

## Runtime evidence

### Neon and MCP: live-verified

Both migrations, `0000_init` and `0001_research_checkpoint`, are applied. A fresh read-only check matched ledger timestamps and SHA-256 hashes to the committed SQL, found all nine application tables and the `runs.research_checkpoint` JSONB column, and confirmed the execution-key, run-idempotency, Checkout-session, and plan-revision uniqueness constraints. No new migration was needed or executed in this checkpoint.

Earlier provisioning verification wrote/read a probe event within a transaction, rolled back, and confirmed its absence. The browser-created research event was subsequently persisted in Neon.

Fresh hosted checks: home/sign-in pages HTTP 200; unauthenticated MCP HTTP 401; bearer-authenticated initialize, tools/list, and ping pass; authenticated get_event for a nonexistent ID returns event_not_found, confirming a hosted database read. Opening MCP with a browser GET is not the authenticated JSON-RPC POST test. Naive-to-MCP session connectivity remains unverified.

### Clerk and research journey: mixed

Actual deployed Google/Clerk sign-in completed and authenticated event creation returned a persisted event URL. Reload restored that same event and its displayed date, timezone, location, guest count, budget, and failed research result. The existing Clerk application was claimed through the official CLI after the account owner completed OAuth consent. It is linked as `we-gotchu`, application `app_3LnoH2aBDyPqxoQM3Fx6a8UaWet`, development instance `ins_3LnoH25CGx4pNuuU52o92MpTOYM`. Fresh host-enabled CLI identity verification confirms Ujjwal and remotely resolves this linked app/development instance. Ujjwal confirmed that his management access is sufficient for now; other teammate membership is unverified and no invitations were sent. Local and deployed public frontend domains both remain `enough-airedale-6136.clerk.accounts.dev`. The separately visible `yc-naive-we-gotchu` / `immune-lark-2628` application is a different instance and was not substituted. The claim preserved the existing database and provider configuration. No Clerk production upgrade or key rotation was performed.

The agreed Birthday brief (20 guests, San Francisco, December 12 2026 at 18:00 America/Los_Angeles, USD 500, paper plates, maximum cancellation loss USD 0) was saved. Continuous polling reached terminal **failed**, with no usable candidates and no bookable Plan. This is a failed research run, not an acceptable partial result. No Naive session ID was saved for that run. Tony is handling the research automation fix; this branch does not modify his code.

Editing/revising to 30 guests and Oakland, restoration of every editable answer, and live stale-result isolation are still unverified. Repeat those checks after Tony's correction is deployed. Do not infer successful research from successful persistence or provider authentication.

MONID_API_KEY authenticated successfully against the read-only Monid wallet endpoint (HTTP 200); no balance or key is published. NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL are configured in production. Earlier authenticated catalogue verification confirmed `z-ai/glm-5.3-flash` supports immediate execution. The existing $0.50 session cap remains unchanged. Provider configuration alone does not establish a completed hosted Naive research journey.

### Stripe: test configuration verified; payment flow pending

The saved Stripe test key authenticated against the intended `yc-hack-naive sandbox` account. Test webhook `we_1UZOSrC2U49BZm5fucPTMPSx` is enabled at `https://we-gotchu.vercel.app/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.expired`. STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are saved in ignored local configuration and Vercel production; no secret values are recorded here.

Production was redeployed to activate the configuration. The production alias subsequently reports READY deployment `dpl_G4tjbi12Ex646NpF71mYAJJDnpa5`, full SHA `2e1976edb73875e9d8eb3bd18b5a168becc0be42`; the earlier research evidence above remains tied to its original commit. Hosted webhook checks passed: unsigned request HTTP 400 invalid_signature; correctly signed synthetic setup.verification event HTTP 200 ignored; replay HTTP 200 duplicate. This creates only a probe entry in the webhook deduplication ledger, with no payment or event changes.

The subsequent authorized Stripe-origin delivery test created one isolated sandbox Checkout session and immediately expired it without opening its payment page or supplying a card. Stripe generated `evt_1UZOj1C2U49BZm5fIqzJnMV5` (`checkout.session.expired`, livemode=false). The deployed signature-verifying handler recorded that exact event in Neon at 2026-11-08T05:33:07.969Z; Stripe subsequently reported pending_webhooks=0. Final session state is expired, unpaid, payment_intent=null; the app has zero payment records for that session. This proves actual sandbox expiration webhook delivery, not a completed payment or refund.

The probe has no application event/approval linkage and triggered no supplier work. No real money, plan approval, purchase, or supplier commitment occurred. Completed-payment and refund paths remain unverified in the hosted sandbox. Supplier execution/cancellation remain simulated adapters; real Naive execution starters remain unwired.

## Contracts and dependencies

Contract 0.4 is unchanged. Transaction fixes (#28), hosting (#33), DOM harness (#39), and frontend integration (#41) are merged. Tony/Leo can use the deployed authenticated event APIs and Neon persistence; no database migration blocks their integration. Controlled API/DOM tests are available in `docs/testing/dom-tests.md`. Historical local test counts belong to their original commits; no new full-suite result is claimed for this documentation checkpoint. The 25 coordination tests and git diff --check passed for this update.

## Next step and blockers

1. Tony: supply the corrected research commit and deployment readiness. Reuse the agreed brief, then revise only guest count and city. Verify a terminal evidence-backed result, reload, saved answers, and isolation from earlier research. No additional credentials or brief are needed from Tony.
2. Clerk management access is sufficient per Ujjwal. Keep the existing claimed development app; no additional team invitation is required for this checkpoint.
3. Stripe sandbox configuration, synthetic signature/deduplication checks, and actual unpaid expiration delivery pass. A completed test-payment/refund rehearsal is separate future work. Demo rehearsal is deferred at Ujjwal’s request.
4. Continue small, reversible commits; report verified, failed, simulated, and pending outcomes separately. No real bookings or supplier commitments during these tests.

The untracked HANDOFF-CODEX.md and original stash `8de106d6fd9a61ca772b059646c753759c0188b3` are preserved.

## Backend edge-case review

Reviewed against main `b1518257371f09c4143b2ce4d7a44045e9c61e65`; reviewed server/contracts files have no diff from this checkout. No production behavior was changed. Prioritize the first two before a completed sandbox payment rehearsal.

1. **High: concurrent completed webhooks can refund a valid payment.** In `src/server/payments/webhook.ts:115-128`, two deliveries can both read awaiting_payment. One moves to executing; the other's conditional update loses and is treated as late/revoked. Before supplier attempts exist, it requests a full refund while the first delivery still starts execution. A temporary controlled-provider regression reproduced one execution hook and one unexpected refund (expected zero).
2. **Medium: interrupted expiration cannot repair event status on retry.** In `src/server/payments/webhook.ts:72-78`, payment is marked expired before the event returns to plan_ready. If that status update throws, the next delivery sees changed=false, skips repair, and records the webhook as processed. A temporary regression reproduced awaiting_payment after retry (expected plan_ready).
3. **Medium: research result publication and event finalization are separate commits.** `src/server/events/service.ts:99,123-127` publishes a terminal run before saving its plan/status. A database error or terminated request between them leaves researching plus a finished run. GET only advances running runs (`:142`), so reload does not repair it. This is a transaction-service recovery gap, separate from Tony's provider fix; confirmed by code/transaction boundaries, not a new live failure experiment.

Existing verification: 89 focused webhook/execution/event/store/MCP tests and 35 contract tests passed. Hosted signed-out event read/create returned 401; malformed Stripe signature returned 400. Existing tests cover sequential duplicate webhooks, interrupted refunds/execution handoffs, cancellation/approval races, ownership denial, stale revisions, and test-payment refusal for live actions. The two temporary regressions failed as expected and were removed after diagnosis; no provider calls were used for those reproductions.

Limits: completed sandbox payment/refund remains untested; asynchronous refund state reconciliation is not implemented. Clerk instance must remain the existing claimed instance to preserve customer ownership of saved events. No concrete cross-user bypass found. No purchases or supplier commitments were made during this review.
