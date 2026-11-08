# Local integration checkpoint

## Identity

The work is local and unpublished.
Stage 3 is `feat/planning-inquiry-drafts` at `dc1bf1fdef4e39929f5df325477b7d4a9d2491e6`.
Stage 4 is `feat/planning-offer-checkout` at `f61acfb58fba96339b13332e795af2a1cd63e456`.
Stage 5 is `feat/local-journey-rehearsal`, with combined application revision `7c1bd8c261747da65a7025a4ce80899e539d5ae4` before this documentation update.
Each later branch contains the earlier branch.
Do not cherry-pick all three histories on top of each other.
The final PRs should retain those stage boundaries and must not trigger a deployment under the current assignment.

## What changed

Stage 3 connects inquiry drafts, explicit send approval, durable mail operations, signed incoming receipts, deduplicated reply jobs and saved interpretation.
Original supplier wording remains available alongside extracted facts.
Failed interpretation can retry from saved evidence without another email.

Stage 4 extracts a versioned offer, shows quantities and costs, and connects exact selections to the existing event approval and sandbox payment model.
Unknown required costs prevent Checkout preparation.
Included deposits are not added twice.
Selection changes invalidate approval and supplier execution.
If payment arrives for an invalidated offer, the existing cancellation and refund path handles it.
Unfinished cancellation remains visible and recoverable.
A settled canceled plan can release its conversation link while retaining transaction history.

Stage 5 adds a manually started local reply runner and a complete rehearsal procedure in `tools/local-rehearsal/README.md`.
The runner uses the existing authenticated endpoint and does not open a second local database connection.
It stops on an uncertain response and does not install a schedule.

## Evidence

Stage 3 controlled browser evidence is under `.scratch/verification/stage3-replies-a249277/`.
It verifies rendering and reload of a labeled controlled reply on that earlier exact revision.
It does not prove real email delivery or this combined revision's browser behavior.

At combined revision `7c1bd8c261747da65a7025a4ce80899e539d5ae4`, these checks passed:

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| Application suite | `bun run test --maxWorkers 2` | 626 tests in 62 files | `/tmp/combined-local-tests.log` |
| Local tools | `node --test tools/team-coordination/*.test.mjs tools/local-rehearsal/*.test.mjs` | 28 tests | `/tmp/combined-local-tools.log` |
| Typecheck | `bun run typecheck` | Exit 0 | Recorded command result |
| Build | `bun run build` | Exit 0 | `/tmp/combined-local-build.log` |

All owned check processes ended, and the managed process inventory was empty afterward.
The payment integration tests use a fake payment provider, signed controlled webhook and real migrated local storage with simulated supplier execution.
The worker tests use controlled HTTP responses.
These are implementation checks, not live provider acceptance.

## Integration instructions

Keep the explicit local PGlite override enabled and preserve the saved database.
Do not apply migrations to shared or hosted storage.
Do not reset records to make a failing check pass.
Run the application as the sole owner of its local database directory.
The reply runner calls the application over HTTP.

A private names-only configuration check found authentication, planner configuration, local storage, mail API/inbox and Stripe configuration present.
Stripe is configured in test mode and the Checkout return URL is local.
`AGENTMAIL_WEBHOOK_SECRET` and `CRON_SECRET` were missing.
Cloudflared is installed, but no forwarding tunnel or webhook subscription was started or configured.
A real provider cannot deliver to localhost without forwarding.
A locally signed synthetic payload cannot replace that live delivery evidence.

## Limitations and cleanup

Tony deferred the remaining live checks until morning.
The approved test address is also the sending inbox.
A self-send check cannot prove independent recipient delivery.
No real supplier may be contacted.

Still unverified on the combined revision:

- Actual mail acceptance, inbox delivery, reply correlation and duplicate provider webhook handling.
- Browser-closed live interpretation and return to the saved reply.
- Real model extraction of a complete selected offer.
- Signed-in browser Checkout, failed payment, abandoned Checkout and actual Stripe webhook delivery.
- Complete same-conversation reload after the above live journey.
- A genuine end-to-end demo recording.

No deployment or production configuration change is authorized.
Publishing the separate PRs remains pending the agreed local live verification.
Do not claim hosted verification or a deployed SHA.
No real payment, purchase or reservation occurred.
Credentials, sign-in, saved records, `.entire` and existing evidence remain preserved.
