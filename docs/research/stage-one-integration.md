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
Its first execution on this merged version must be recorded before calling browser integration verified.
Passing research means a useful sourced next decision; it does not establish current stock, total cost, payment or supplier commitments.
