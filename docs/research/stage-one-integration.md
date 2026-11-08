# Stage-one integration

The natural-language planning flow lives at /planning and saved conversations at /planning/$id.
The existing structured homepage, /events routes, approval flow and receipts from PRs 51 and 53 remain intact.
Development shows a homepage link to planning.
Production shows that link only when VITE_PLANNING_ENABLED=true at build time.
This setting controls discovery of the new flow, not API authorization.
Planning endpoints always require the signed-in customer and do not create a transaction plan from a selection.

## Before enabling production

1. Configure DATABASE_URL, existing Clerk settings, NAIVE_API_KEY and NAIVE_PLANNING_AGENT_ID in the deployment environment.
2. Apply committed migrations with `bun run db:migrate` in the intended production environment, including 0002_planning_conversations.sql.
3. Verify the configured hosted planner's definition, model and public-research permissions.
4. With the homepage link still disabled, verify /planning directly with a signed-in customer, one brief, a sourced response and actual reload.
5. Set VITE_PLANNING_ENABLED=true and redeploy only after those checks pass.

Do not copy local database paths or customer test data into production.
The setup script's NAIVE_PLANNING_MODEL setting does not change the legacy NAIVE_MODEL value.
Provider setup is an explicit operation and is not part of build, startup or migrations.
The Vercel project is not accessible to the integration session's CLI login, so production configuration and migration are not claimed as verified.
The existing production flow can continue while the new entry remains disabled.

## PR 45 disposition

This branch contains PR 45's backend finalization, supplier evidence and discovery improvements.
The result components and their tests from that PR were deleted by PR 51's frontend replacement.
The integration preserves those deletions instead of restoring the obsolete presentation.
The old PR can be closed as superseded once this combined branch merges.
PR 52 remains a separate draft and is not included in this stage.

## Verification

The merged baseline passed 479 application tests, 25 coordination tests, typecheck and build.
The receipt date now explicitly joins the day and time with 'at', matching the existing test across runtime locale-format differences.
The repo-local verify-we-gotchu skill documents the actual browser entry, provider evidence, timing and reload requirements.
Its first execution passed on code revision 1611a5eaebbf64ace448825bc47ed81e2a60f95b.
Passing research means a useful sourced next decision; it does not establish current stock, total cost, payment or supplier commitments.

## Merged-code browser proof

On November 8, 2026, the structured homepage and date/time calendar rendered without submitting a legacy event.
The research link opened /planning.
One picnic brief was submitted at 09:05:59.859 UTC, working state was observed at 09:06:06, and completion was observed by 09:07:09.
The upper observation bound was 69.141 seconds; provider completion timing was not captured.
Conversation planning_adf1aada-e8e6-4046-a644-cb7f595758d3 returned Picnic at Transit at Presidio Tunnel Tops and a Factory Direct Party 20-count pack of white dinner plates listed at USD 5.49 before shipping and tax.
One pack covers 12 adults with eight spares.
The venue evidence came from official search excerpts; current stock, San Francisco delivery, complete total and event-date seating remain unverified.
Command-R retained the proposal.
The bounded network capture contained no planning entries, so GET-only behavior and absence of duplicate server creates are not proven by this browser run.
The operator submitted once.
Screenshots and sanitized proposal/text are retained locally under .scratch/verification/1611a5ea-picnic/.
The preview reported an invisible tab and server console aborted errors; these did not prevent the observed journey, but remain verification-environment limitations.
The verification-owned server was stopped and evidence retained.
No selections, follow-up, payment, mail or deployment were tested.
