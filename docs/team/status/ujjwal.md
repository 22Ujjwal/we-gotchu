## Venue images — 2026-11-08

Branch: `feat/venue-images`, baseline `5eafbcb`; [draft PR #61](https://github.com/22Ujjwal/we-gotchu/pull/61), pushed but not merged or deployed.
Independent source-page image lookup returns zero to four images for a caller-owned
saved venue option without calling the planning agent or changing the proposal.
Source URLs are public HTTPS only with pinned IPv4 DNS, no redirects, bounded HTML
size and time. Responses are private/no-store. No new credentials or migrations.

Verification: 517 application tests and 25 coordination tests passed; typecheck,
Vercel build and independent review passed. A review-found directory metadata
association bug was reproduced and fixed before final verification. Live source
retrieval of The Pearl worked under Node and Bun and through the endpoint module
with a test-owned record. Its captioned rooftop photo was downloaded and visually
checked. Hosted auth/endpoint and frontend carousel are not verified or deployed.

Contract, configuration and example: [venue-images.md](../venue-images.md).
Next: Tony/Leo wire the independent image response into planning cards. Review
in draft PR #61; coordinate generated route tree when integrating newer main.
Optional places-provider matching/Place IDs remain a future increment, not shipped.
No research, prompt/schema, frontend design, payment, or supplier changes.

## Email send key and full event duration — 2026-11-08

Branch: `fix/agentmail-send-key`; baseline `776cd5b`; [draft PR #55](https://github.com/22Ujjwal/we-gotchu/pull/55), not merged or deployed.
Fixes the invalid AgentMail send key and preserves optional event `endsAt` from
Leo's form through the API/reload into the customer email. Includes timezone,
end date and elapsed duration. Existing events remain supported. No migration,
provider send, vendor outreach, payment change, or changes to email retry/copy.
Touches Leo's brief adapter solely to retain the already-entered end time;
frontend and research consumers should review this compatible contract addition.
Independent review found no functional blockers against the integrated baseline.
Focused email/adapter/event tests: 41 passed. Typecheck, Vercel build and all
25 coordination tests passed. Full application suite: 483 passed.
Code commits: `995b878` (send key), `f7facec` (event duration).
The prior receipts formatting failure was addressed in latest main before integration.
Next: review the compatible adapter/contract addition with Leo/Tony; no merge or
production deployment is part of this handoff.

# Ujjwal's status

## Latest checkpoint — sandbox payment/refund verified

Owner: Ujjwal. Branch: `fix/refund-expiry-integration`. Baseline: `6001bd202beb42792bf62743dac10e593f9cfee8` (PR #49 merged). This checkpoint supersedes the historical entries below; new atomic-expiration and refund-reconciliation code is on branch, not yet deployed.

Updated: 2026-11-07T22:32:00-08:00. Tested code commit: `460f26c7dfb39bf1fd2fb0921bf69bfd0772c71c`. Final checks: 418 application tests, 25 coordination tests, typecheck, production and Vercel builds, and whitespace check pass. Independent review found no remaining blockers after the follow-up race regressions. Contract 0.4 and its consumers are unchanged.

- Hosted app: https://we-gotchu.vercel.app; MCP: https://we-gotchu.vercel.app/api/mcp. The sandbox flow exercised the deployed baseline, not the new branch.
- Stripe sandbox: actual hosted Checkout completed a USD 315 test payment. Stripe's canonical PaymentIntent reports succeeded/livemode=false; the matching completed webhook reports pending_webhooks=0. The persisted event reached booked with two explicitly simulated commitments. Cancellation produced two simulated cancellation attempts and a full USD 315 refund, independently retrieved from Stripe as succeeded. Event is canceled. No real money, suppliers, or purchases were involved.
- This was an isolated synthetic-owner fixture created/canceled through backend services with the real Neon database and hosted Stripe webhook. The browser return correctly denied the current customer's access to that test-owned event. It is not evidence of the entire signed-in frontend approval/cancel flow.
- Probe identifiers: event `evt_013a778a1f1c463b98bc667687578712`, Stripe delivery `evt_1UZPXOC2U49BZm5fGMS9mAty`, refund `re_3UZPXMC2U49BZm5f09QHYB4c`. No credentials or card details are recorded.
- On branch: expired Checkout repair shares the event lock with approval/cancellation; refund update/failure deliveries retrieve current Stripe state and validate payment identity; delayed creation responses cannot regress saved terminal refund state. No migration or public schema change.
- Naive ping: dedicated agent `agt_h0tnsg8fs3z8yhfg8wewgtxpzp` allows only `wegotchu.ping`, defaults all other tools to deny, disables handoffs, and caps task/monthly spend at USD 0.50. Model is `z-ai/glm-5.3-flash`. Vault creation returned 403 because the existing key lacks admin scope; no credential was uploaded and no session started. Existing research agent/vault were preserved. Need an admin-authorized vault setup, then one capped session with actual tool-result evidence.
- Research remains dependent on Tony's PR #45. Prior hosted sign-in/persistence succeeded, but research failed; the revised Oakland/30-guest journey remains unverified. Demo deferred. Stripe readiness does not prove research readiness.
- After deployment, subscribe the existing test webhook to `refund.updated` and `refund.failed`, retaining both Checkout events. Pending→terminal delivery on a real asynchronous refund remains separate from the immediately succeeded test refund.

## Historical evidence (superseded where noted above)

Owner: Ujjwal.
Updated: 2026-11-07T21:34:11-08:00
Baseline and hosted test commit: `5b180cc8c57c85c876852579cf448f9cbc7c627a`.
Branch: [fix/payment-retry-guards](https://github.com/22Ujjwal/we-gotchu/tree/fix/payment-retry-guards).
PR: [#49](https://github.com/22Ujjwal/we-gotchu/pull/49), backend retry/sandbox follow-ups on branch; #48 and earlier hosted handoff #43 are merged.
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

1. **High, fixed on this branch only: concurrent completed webhooks can refund a valid payment.** In `src/server/payments/webhook.ts:115-128`, two deliveries can both read awaiting_payment. One moves to executing; the other's conditional update loses and is treated as late/revoked. Before supplier attempts exist, it requests a full refund while the first delivery still starts execution. A temporary controlled-provider regression reproduced one execution hook and one unexpected refund (expected zero).
2. **Medium: interrupted expiration cannot repair event status on retry.** In `src/server/payments/webhook.ts:72-78`, payment is marked expired before the event returns to plan_ready. If that status update throws, the next delivery sees changed=false, skips repair, and records the webhook as processed. A temporary regression reproduced awaiting_payment after retry (expected plan_ready).
3. **Medium: research result publication and event finalization are separate commits.** `src/server/events/service.ts:99,123-127` publishes a terminal run before saving its plan/status. A database error or terminated request between them leaves researching plus a finished run. GET only advances running runs (`:142`), so reload does not repair it. This is a transaction-service recovery gap, separate from Tony's provider fix; confirmed by code/transaction boundaries, not a new live failure experiment.

Existing verification: 89 focused webhook/execution/event/store/MCP tests and 35 contract tests passed. Hosted signed-out event read/create returned 401; malformed Stripe signature returned 400. Existing tests cover sequential duplicate webhooks, interrupted refunds/execution handoffs, cancellation/approval races, ownership denial, stale revisions, and test-payment refusal for live actions. The two temporary regressions failed as expected and were removed after diagnosis; no provider calls were used for those reproductions.

Limits: completed sandbox payment/refund remains untested; asynchronous refund state reconciliation is not implemented. Clerk instance must remain the existing claimed instance to preserve customer ownership of saved events. No concrete cross-user bypass found. No purchases or supplier commitments were made during this review.

## Concurrent webhook fix — on branch, not deployed

Implementation baseline: `b1518257371f09c4143b2ce4d7a44045e9c61e65`. Main subsequently advanced through unrelated UI changes; payment files are unchanged. The losing awaiting_payment-to-executing update now throws a retryable error before refund, execution handoff, or acknowledgment. Stripe retry reads fresh state and can observe the winner’s receipt or a real cancellation. No migration, public schema, provider configuration, or Tony-owned code change.

Regression first failed with one unexpected refund; after the six-line guard it passes with one execution handoff, zero refunds, one retryable loser, and a harmless duplicate retry. All 376 application tests, 25 coordination tests, typecheck, and production build passed. Independent review found no blockers. Existing sequential late/revoked refund and retry coverage stays green. No real provider payment was performed for this fix.

The interrupted-expiration and research-finalization gaps remain separate follow-ups. Stripe remains sandbox-only in configuration; an explicit code-level live-payment lock is still a separate safeguard proposal.

## Payment retry guards — on branch

Branch: `fix/payment-retry-guards`, based on merged race fix `34ab7f161e2969b8695ed61ff3ff5adc253a6c8f`. PR #48 is merged and production READY at that SHA was verified.

Two separate commits: reject live Stripe standard/restricted keys at adapter construction (no override), and recover interrupted Checkout expiration from persisted expired payment state. Retry recovery checks current payment/approval, plan revision, revocation, cancellation, and paid state. No provider keys or execution mode were changed; no real payment/provider calls were used for these patches.

Known preexisting limit: expiration eligibility reads and event-status update are not one atomic operation, so a new approval racing between them remains a separate concurrency issue. Progress-message recovery after a status write is also outside this small fix. These changes cover interrupted-delivery recovery, not all concurrency cases.

Research-finalization recovery is a third separate commit on this branch. Polling reuses saved terminal results and any persisted plan to finish interrupted status writes, without rerunning providers. It rechecks cancellation and brief revisions; no schema or Tony-owned files change. Existing limits remain: canceled events can retain an inert plan if cancellation races the save, and progress messages can be lost after a successful status write. Status cannot be revived by these retries.

Final combined verification: 397 application tests, 25 coordination tests, typecheck, production build, and diff check pass. Both payment and recovery reviews found no introduced blockers. Earlier isolated runs hit missing DOM dependencies/initialization timeouts; the clean combined install and two-worker run passed without changing timeouts. These three commits are on branch, not yet deployed.

## External agent connection — local branch, 2026-11-08

Owner: Ujjwal. Updated: 2026-11-08T08:42:40-08:00. Branch `feat/agent-connect`; no PR, push, merge or deployment. Baseline cached main `b986ab636725029fc6c1b694a1c34494a42a7bca`. Tested implementation `4b5f95c4ff115ec59e18c1c061cf57d83dd80d6a`. Older entries above retain their original evidence and do not describe this branch's deployment.

Implemented customer-scoped planning tools and MCP/JSON handler factories, reusing existing planning persistence. Agents can create/poll/refine/toggle saved selections and return a customer review link. No inquiry approval/sending, payment or booking authority. Provider behavior in tests is simulated. No hosted endpoint is mounted.

Verified: 557 application tests (single worker), 25 coordination tests, root typecheck and Vercel build; separately 4 official MCP client tests, package typecheck/build and frozen install. No existing planning/frontend/internal MCP/root config/dependency/schema/migration edits. No production configuration or provider calls.

Handoff and exact commits: [agent-connect.md](../agent-connect.md). Interface/configuration/client recipe: [integration README](../../../integrations/arrange-agent-connect/README.md). Needs durable customer enrollment/revocation and admission, coordinated runtime/routes/CI, and hosted/client-specific verification before public availability. Tony's evolving planner contract must be reconciled before integration; his current frontend work is not blocked. Independent review found one blocking cleanup-timeout issue, reproduced and fixed in `4b5f95c`; one minor authority metadata wording issue is deferred in the handoff. The full single-worker rerun passed after an earlier parallel run hit two existing database test timeouts. Next: integration review with Tony and customer enrollment/admission design; keep local pending publication permission.
