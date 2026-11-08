# Ujjwal's status

Owner: Ujjwal.
Updated: 2026-11-07T20:44:25-08:00
Baseline: main `38516c9d6d820ea6965d4aac76677c9d40c5950f`.
Branch: [docs/neon-setup](https://github.com/22Ujjwal/we-gotchu/tree/docs/neon-setup); status-only PR pending publication.
Availability: Neon database and migrations live-verified; research configuration deployed; shared Clerk claim/sign-in and Stripe setup still pending.

## Current hosted result

App: https://we-gotchu.vercel.app
MCP: https://we-gotchu.vercel.app/api/mcp
Production was redeployed after database connection; deployment `dpl_5tzhZQVy7ggx47MzWHpJQKkYW2eT` is READY.

Neon resource `we-gotchu-db` is on Free (`free_v3`) in iad1, connected to this project's production environment. Optional Neon Auth is disabled because the app uses Clerk. DATABASE_URL is configured in production and ignored local configuration; no connection values are published.
Both committed migrations were applied: initial tables and runs.research_checkpoint. Verified two migration ledger entries, nine public tables, and the checkpoint column. A transaction wrote and read a probe event, then rolled back; its absence was confirmed afterward.
A bearer-authenticated hosted MCP get_event call for a new nonexistent ID returned event_not_found. This verifies the deployed server queried Neon successfully, separately from the earlier ping-only checks.

NAIVE_API_KEY and MONID_API_KEY are production secrets. An authenticated read of Naive's live catalogue confirmed z-ai/glm-5.3-flash supports immediate execution; NAIVE_MODEL is configured to that exact ID and deployed. The existing 500,000 micro-USD ($0.50) session cap was unchanged. No live research session, real purchase, or supplier commitment was started. Monid credential validity remains unverified by a provider request.

## Remaining handoff

Complete the shared Clerk application claim/access check and actual deployed sign-in. Then, after Tony supplies the final frontend integration commit, agreed brief, revised brief, and expected terminal outcome, verify authenticated event creation, polling through research completion, reload restoration, and changed-brief handling.
Stripe test keys and signed webhook verification remain pending and separate from research readiness.
DOM-test prerequisite [PR #39](https://github.com/22Ujjwal/we-gotchu/pull/39) is published; its standard CI passed. Tony and Leo own API wiring and screen coverage; no design changes were made here.
Hosting [PR #33](https://github.com/22Ujjwal/we-gotchu/pull/33) and transaction [PR #28](https://github.com/22Ujjwal/we-gotchu/pull/28) are merged.

## Historical handoff (superseded where it conflicts with current hosted result)

The following records the earlier application verification at a6afd9f and deployment at 6f25979. Its missing-database/provider statements are historical; use the current hosted result above for readiness.



Contracts and fixtures (#16), Clerk authentication (#17), standalone research (#18), the fixture-backed frontend (#19), and backend core (#20) are merged.
The merged baseline remains TanStack Start with Bun; framework-migration PR #6 is closed without merging.
Backend core includes authoritative storage, customer event APIs, Stripe handling, guarded MCP tools, simulated supplier adapters, and scripted execution hooks.

Merged PR #28 fixes cancellation completing while Stripe creates Checkout: the approval transaction checks cancellation under the event lock, rejects approve with 409, and requests expiry of the unused session without saving approval or payment.
A brief update after cancellation was requested is also refused with 409, so a canceled event can no longer return to research.
PR #28 also adds a stronger refund regression: failed request, successful same-key retry, and duplicate delivery without extra refund or supplier work.
Main contains the broader payment-handoff retry implementation, preserved during the PR #28 integration.

The [transaction spec](../../../.scratch/specs/transactions.md) is published through the local tracker with Owner Ujjwal and Label ready-for-agent.
It follows to-spec's structure and the existing approved fake-Stripe and service/database testing boundaries.
The transaction brief and contract prose now match server-derived execution keys, cancellation during Checkout creation, and payment-handoff retry behavior.

## Runtime evidence

At the tested commit:

- Typecheck passed.
- All 213 application tests across 15 files passed with the standard test command run alone.
- Prior integrated baseline passed all 25 standalone coordination tests; those tools are unchanged in this hosting increment.
- An earlier concurrent run hit database-initialization hook timeouts in three suites; the standalone rerun passed without changing source, test settings, or timeout limits.
- Production client/server build passed and left the shared generated route repair unchanged.
- Historical PR #28 regression evidence: cancellation returned a Checkout URL before the fix; both focused suites passed afterward (41 tests).
- The refund regression passed against main's existing retry implementation.

Neon is implemented but hosted migration/runtime remain unverified here.
Stripe evidence uses controlled test providers; hosted test Checkout, webhook, and refunds remain unverified.
Public MCP is live at https://we-gotchu.vercel.app/api/mcp. Direct bearer-authenticated initialize, tools/list, and ping passed on 2026-11-08 (UTC), including after deploying current main. An unauthenticated request returned 401. Naive-session connectivity remains unverified.
Supplier commits and cancellations use simulated adapters. Scripted execution is a labeled fallback.
Local Clerk keys are present; the handoff records temporary accountless development keys. A claimed shared Clerk application and its access list remain unconfirmed. Deployed sign-in has not been verified.
The app is deployed at https://we-gotchu.vercel.app under Vercel project we-gotchu, linked to the repository and account 22ujjwal. Home and /sign-in return HTTP 200; this is page availability, not a completed customer sign-in. The shared Clerk account claim/access list remains pending; the deployment currently uses existing development keys.
No live supplier transaction, completed customer sign-in, shared Clerk account claim, or hosted database migration is claimed.

## Contracts and dependencies

Contract version: 0.4. This branch changes no public schema and adds no migration.
Tony and Leo consume the same event/action inputs and existing responses; the merged 409 closes a canceled-event race.
The exact generated route repair from [#26](https://github.com/22Ujjwal/we-gotchu/pull/26) is now merged on main and integrated here. No independent route repair was generated.
Deployment configuration [#21](https://github.com/22Ujjwal/we-gotchu/pull/21) is now merged and integrated here.
Tony's research [#24](https://github.com/22Ujjwal/we-gotchu/pull/24), supplier evidence [#25](https://github.com/22Ujjwal/we-gotchu/pull/25), and coordination tooling #23 are now merged and integrated here. Their hosted application path still requires verification.
Root CI [#27](https://github.com/22Ujjwal/we-gotchu/pull/27) is merged; its standalone coordination checks are included in local integration verification.
Leo's merged frontend still needs verification against real event, progress, and Checkout responses.
No teammate approval is inferred from tests, merges, or this status file.

## Next step and blockers

PR #28 and prerequisite PRs #21 and #23 through #27 are merged. Current main also includes #29 and #30. The current-main app was built and deployed; finish the remaining hosted account and credential setup next.
Configure DATABASE_URL, a test-mode STRIPE_SECRET_KEY, NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL in the ignored .env.local; all five were missing in the latest check. The MCP bearer and Clerk keys were present. Apply both database migrations before deploying real research.
After configuring and migrating Neon, configure the Stripe webhook and verify a real Naive ping and the hosted test-payment flow. Direct public MCP authentication and ping are verified already.
Real execution and cancellation session starters remain unwired: AGENT_MODE=naive selects placeholder hooks. Keep the working scripted fallback explicitly labeled until real starters are implemented and verified.
The real research integration intentionally returns partial evidence with unknown final costs and no bookable Plan. A payment/booking rehearsal needs verified costs and terms or the explicitly labeled simulated research path. Coordinate frontend API wiring, Checkout return URLs, continuous research polling, and mode labels with Leo.

The original local fixes and handoff are preserved in stash `8de106d6fd9a61ca772b059646c753759c0188b3`; no stash was dropped. The original deployment branch remains at its previous commit.
Hacking ends at 11:00 AM Pacific on November 8, 2026. Prioritize one verified event flow with explicit live, test, and simulated labels.

## Hosted setup handoff

Production app: https://we-gotchu.vercel.app
MCP endpoint: https://we-gotchu.vercel.app/api/mcp
Vercel account: 22ujjwal; project scope: ujjwal-guptas-projects-0fa3ab48.
Production environment contains the existing Clerk development keys, MCP bearer, and APP_URL. Secret values are not recorded here.
The explicit Vercel build command uses the verified Vite/Nitro build rather than the detected standalone nitro build.

Remaining: complete shared Clerk account signup/claim and confirm members; supply the intended Neon connection and Stripe test key; run database migrations; configure the Stripe webhook; complete deployed sign-in; test a real Naive session separately. Real research additionally needs NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL.

Current production deployment: `dpl_6DF759cX1FR8Hff39C2hhfC7vYDm`, serving Git main `6f2597989a1b738293f18972312d4d7ddd2f5db9` after PR #32. Vercel reports READY; this automatic Git build supersedes the earlier prebuilt deployment. Refreshed app/sign-in page and direct MCP checks pass. The 213-test local verification above applies to `a6afd9f`, not this newer source.

Production environment names were rechecked: APP_URL, VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, and MCP_BEARER_TOKEN only. DATABASE_URL, Stripe credentials/webhook secret, NAIVE_API_KEY, MONID_API_KEY, and NAIVE_MODEL are not configured. Neither database migration has been applied by this session. Shared Clerk claim/membership and completed login remain unverified.

Leo can wire the existing EventView and poll GET /api/events/{id}?afterSequence=N; hosted end-to-end verification awaits auth, database, and provider setup. Polls advance research stages and must continue until a terminal result. Tony should confirm the shared provider workspace/model, provision research credentials securely, and provide one agreed test brief and expected outcome. Real research completion and Naive-to-MCP connectivity remain separately unverified.
