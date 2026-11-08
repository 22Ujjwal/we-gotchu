# Ujjwal's status

Owner: Ujjwal.
Updated: 2026-11-07T21:12:00-08:00
Baseline and hosted test commit: `5b180cc8c57c85c876852579cf448f9cbc7c627a`.
Branch: [docs/neon-setup](https://github.com/22Ujjwal/we-gotchu/tree/docs/neon-setup).
PR: [#43](https://github.com/22Ujjwal/we-gotchu/pull/43), status documentation only; not merged.
Availability: backend, DOM harness (#39), and connected journey (#41) merged. Hosted database, sign-in, event persistence, and direct MCP verified. Successful research and Stripe remain pending.

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

Actual deployed Google/Clerk sign-in completed and authenticated event creation returned a persisted event URL. Reload restored that same event and its displayed date, timezone, location, guest count, budget, and failed research result. The existing Clerk application was claimed through the official CLI after the account owner completed OAuth consent. It is linked as `we-gotchu`, application `app_3LnoH2aBDyPqxoQM3Fx6a8UaWet`, development instance `ins_3LnoH25CGx4pNuuU52o92MpTOYM`. CLI identity confirms Ujjwal; team membership remains unverified. Local and deployed public frontend domains both remain `enough-airedale-6136.clerk.accounts.dev`. The separately visible `yc-naive-we-gotchu` / `immune-lark-2628` application is a different instance and was not substituted. The claim preserved the existing database and provider configuration. No Clerk production upgrade or key rotation was performed.

The agreed Birthday brief (20 guests, San Francisco, December 12 2026 at 18:00 America/Los_Angeles, USD 500, paper plates, maximum cancellation loss USD 0) was saved. Continuous polling reached terminal **failed**, with no usable candidates and no bookable Plan. This is a failed research run, not an acceptable partial result. No Naive session ID was saved for that run. Tony is handling the research automation fix; this branch does not modify his code.

Editing/revising to 30 guests and Oakland, restoration of every editable answer, and live stale-result isolation are still unverified. Repeat those checks after Tony's correction is deployed. Do not infer successful research from successful persistence or provider authentication.

MONID_API_KEY authenticated successfully against the read-only Monid wallet endpoint (HTTP 200); no balance or key is published. NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL are configured in production. Earlier authenticated catalogue verification confirmed `z-ai/glm-5.3-flash` supports immediate execution. The existing $0.50 session cap remains unchanged. Provider configuration alone does not establish a completed hosted Naive research journey.

### Stripe: test configuration verified; payment flow pending

The saved Stripe test key authenticated against the intended `yc-hack-naive sandbox` account. Test webhook `we_1UZOSrC2U49BZm5fucPTMPSx` is enabled at `https://we-gotchu.vercel.app/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.expired`. STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are saved in ignored local configuration and Vercel production; no secret values are recorded here.

Production was redeployed to activate the configuration. The production alias subsequently reports READY deployment `dpl_G4tjbi12Ex646NpF71mYAJJDnpa5`, full SHA `2e1976edb73875e9d8eb3bd18b5a168becc0be42`; the earlier research evidence above remains tied to its original commit. Hosted webhook checks passed: unsigned request HTTP 400 invalid_signature; correctly signed synthetic setup.verification event HTTP 200 ignored; replay HTTP 200 duplicate. This creates only a probe entry in the webhook deduplication ledger, with no payment or event changes.

These probes validate signing configuration and duplicate handling, not Stripe-origin delivery or a completed payment. Test Checkout, Stripe-delivered payment events, and refunds remain unverified. No plan approval, Checkout creation, purchase, or supplier commitment was performed. Supplier execution/cancellation remain simulated adapters; real Naive execution starters remain unwired.

## Contracts and dependencies

Contract 0.4 is unchanged. Transaction fixes (#28), hosting (#33), DOM harness (#39), and frontend integration (#41) are merged. Tony/Leo can use the deployed authenticated event APIs and Neon persistence; no database migration blocks their integration. Controlled API/DOM tests are available in `docs/testing/dom-tests.md`. Historical local test counts belong to their original commits; no new full-suite result is claimed for this documentation checkpoint. The 25 coordination tests and git diff --check passed for this update.

## Next step and blockers

1. Tony: supply the corrected research commit and deployment readiness. Reuse the agreed brief, then revise only guest count and city. Verify a terminal evidence-backed result, reload, saved answers, and isolation from earlier research. No additional credentials or brief are needed from Tony.
2. Ujjwal: confirm team membership for the now-claimed existing Clerk application. Ownership claim and customer sign-in are verified separately; no teammate access is inferred.
3. Ujjwal: Stripe test configuration and synthetic signature checks now pass. Stripe-origin delivery and an explicitly scoped test-payment rehearsal remain separate from research; do not claim a completed payment from the setup probe.
4. Continue small, reversible commits; report verified, failed, simulated, and pending outcomes separately. No real bookings or supplier commitments during these tests.

The untracked HANDOFF-CODEX.md and original stash `8de106d6fd9a61ca772b059646c753759c0188b3` are preserved.
