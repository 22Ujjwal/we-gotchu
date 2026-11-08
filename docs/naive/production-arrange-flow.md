# Production arrangement rehearsal

This branch keeps main's venue cards, receipt layout, and arranging screen while connecting them to the saved supplier conversation.
New homepage submissions use `/planning/:id`.
An existing `/events/:id` can hand its selected venue and the supply shown on its receipt to the same flow through `POST /api/events/:id/arrange`.
The handoff checks ownership through the event service and binds the request to the saved brief revision.
Repeated handoffs reuse the same conversation and arrangement.
Unknown prices display `Quote needed`, never zero.

## Deployment requirements

Apply database migrations with `bun run db:migrate` against the deployment database before testing.
This includes `0003_supplier_mail` and `0004_payment_paid_at`.
Production does not migrate on startup.

Keep the existing Clerk, database, research, and Stripe sandbox settings.
Set `APP_URL` to the production HTTPS origin so customer emails and checkout return to the deployed app.
Configure these additional server variables from `.env.example`:

- `NAIVE_COMPANY_AGENT_ID` identifies the supplier coordinator with the supplier coordination skill attached.
- `PLANNING_TOOLS_SECRET` signs access scoped to one arrangement.
- `PLANNING_TOOLS_BEARER` protects the tool endpoint and must match the coordinator's vault credential.
- `NAIVE_WEBHOOK_SECRET` verifies session callbacks.
- `PLANNING_TEST_SUPPLIER_EMAIL` is the only supplier recipient permitted during this rehearsal.
- `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, and `AGENTMAIL_WEBHOOK_SECRET` configure mail and authenticated replies.

Point the coordinator's `arrange` tool server at `APP_URL/api/planning/tools`.
Subscribe its `session.idle` webhook to `APP_URL/api/planning/company-webhook`.
Point incoming mail callbacks at `APP_URL/api/supplier-mail/webhook`.
Keep the existing Stripe webhook at `APP_URL/api/stripe/webhook`.
Do not use a local tunnel for these production callbacks.
The application reports supplier coordination unavailable when required configuration is missing.

## Manual production check

Create a fresh event or open an existing researched event with no payment.
Choose a venue and click Arrange.
The selected venue must remain selected after the handoff.
The customer should see the existing arranging screen and receive a request acknowledgment.
Reply from the configured supplier test inbox in the original email thread.
The customer should receive the quote email and see the saved offer without a manual worker call.
Approve the offer and complete sandbox Checkout once.
Verify the saved paid state after reload and the customer confirmation email.
Supplier fulfillment remains simulated, and no real reservation or purchase is authorized.

## Verification limits

The production event supplied for diagnosis required a sign-in in the available browser profile.
The current CLI account could not access the Vercel project named `we-gotchu`.
No production environment variables, database records, provider configurations, emails, or payments were changed during this PR work.
Local typechecking, build checks, and the existing suites do not establish that production credentials and callbacks are configured.

## Local verification

The full existing suite passed with 645 tests across 62 files before the final receipt and readiness refinements.
The affected UI suite then passed with 114 tests across 10 files.
The affected planning and adapter suite passed with 120 tests across 19 files after the readiness changes.
Typechecking and the production build passed.
A separate in-memory handoff check preserved the selected venue and supply, dispatched once, and reused the same conversation on replay.
That check used existing fixture data and made no provider calls.
No new test cases were authored for this PR; existing backend tests accompanied the port and obsolete UI assertions were updated.
