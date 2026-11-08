# Local integration checkpoint

## Identity

This handoff records the local integration on November 8, 2026.
Stage 3 is `feat/planning-inquiry-drafts`, based on the integrated stage-two work and including the isolated mail transport from PR #63.
Stage 4 is `feat/planning-offer-checkout`, based on Stage 3.
Stage 5 is `feat/local-journey-rehearsal`, based on Stage 4.
Each later branch contains the earlier branch; do not cherry-pick all three histories onto each other.
PR #63 must remain unmerged during this integration.
No deployment is authorized, and `vercel.json` disables automatic deployments for these three branches only.

The combined application code was tested at `c18416fd37145864717498b09446d2dc5bf302e7`.
Restacking produced `7a0108403db6847b129c81e05dab0b9c3f453759` with an identical application tree and only the branch deployment configuration added.
Later delivery commits update CI and documentation, not application behavior.
Use the PR head for the final published revision and the evidence revision for each runtime claim below.

## What changed

Stage 3 connects inquiry drafts, explicit send approval, durable mail operations, signed incoming receipts, deduplicated reply jobs and saved interpretation.
Original supplier wording remains available alongside extracted facts.
Failed interpretation can retry from saved evidence without another email.
An incoming copy of the original outgoing message cannot become its own supplier reply.

Stage 4 extracts a versioned offer and connects exact selections to the existing event approval and sandbox payment model.
Unknown required costs prevent Checkout preparation, and included deposits are not added twice.
Selection changes invalidate approval and supplier execution.
If payment arrives for an invalidated offer, the existing cancellation and refund path handles it.
Unfinished cancellation remains visible and recoverable.
A settled canceled plan can release its conversation link while retaining transaction history.
The browser response parser retains offers and payment links, and payment approval and execution share the configured clock.

Stage 5 adds a manually started local reply runner, a private payment configuration preflight and rehearsal recipes.
The runner uses the existing authenticated endpoint and does not open a second local database connection.
It stops on an uncertain response and does not install a schedule.
CI runs the local tooling checks alongside the coordination tests.

## Evidence

| Check | Exact command or action | Result | Evidence location |
| --- | --- | --- | --- |
| Application suite at `c18416f` | `bun run test --maxWorkers 2` | 629 tests in 62 files passed | `/tmp/final-mail-fixed-tests.log` |
| Local tools at `c18416f` | `node --test tools/team-coordination/*.test.mjs tools/local-rehearsal/*.test.mjs` | 31 passed | `/tmp/final-mail-fixed-tools.log` |
| Typecheck at `c18416f` | `bun run typecheck` | Exit 0 | Managed check `489cfb4f37d74aaeaf972592085e9306` |
| Build at `c18416f` | `bun run build` | Exit 0 | `/tmp/final-mail-fixed-build.log` |
| Inquiry draft browser check at `f452e55` | Prepare, edit, save, reload, deselect, reselect and replace | Passed for the observed saved draft workflow | `.scratch/verification/stage3-drafts-f452e55/` |
| Controlled reply browser check at `a249277` | Inspect incomplete quote and original wording, then reload | Passed; unknown extra charges remained unknown | `.scratch/verification/stage3-replies-a249277/` |
| Real interpretation at `3f6c119` | Retry a saved failed controlled reply, run one worker, prepare offer | Model interpretation and saved complete offer passed; browser offer omission found and subsequently fixed | `.scratch/verification/failed-reply-3f6c119/` |
| Sandbox payment browser check at `b43db34` | Review, abandon, reopen same Checkout, decline, then successful test payment | Stripe test payment and saved paid state passed after official redelivery of the original signed event | `.scratch/verification/stage4-live-b43db34/` |
| Mail self-send at `c18416f` | Approve one controlled inquiry, close tab, inspect signed receipt and worker | Provider accepted it, inbox received it, and outgoing echo created zero replies or jobs | `.scratch/verification/final-mail-state.json` |
| External reply journey | Different approved team-controlled sender replies to the inquiry | Deferred by Tony; not verified | No external recipient approved yet |
| Hosted journey | Deploy and verify a single end-to-end event | Not run; deployment excluded | No deployed SHA |

### Payment details

The controlled quote was $200, with a $50 deposit included in that amount.
Tax, cleaning and fees were included in the quoted total; zero additional-charge fields do not mean a zero tax rate.
The linked event is `evt_5d96e4c3-3193-4239-b029-d0392831fcfa` and offer is `offer_69a82cbb-3dc1-4e94-9006-892ed0d26ad9`, revision 1.
The browser observed an explicit decline before the authorized successful sandbox payment.
Provider reconciliation confirmed a complete, paid test Checkout for 20000 USD minor units.
The application initially remained pending because duplicate local signing-secret assignments loaded the wrong webhook secret.
After correcting that private configuration, the original test event was resent through the official provider mechanism.
This was not a new payment, a fabricated webhook or proof of natural retry behavior.
At 13:48 UTC, the app stored payment paid and exactly one succeeded simulated supplier attempt.
Reload retained that state and displayed the simulated-execution disclosure.
No real venue was reserved or purchased.

### Mail details

The approved test address was the application's own sending inbox.
The second self-send at 13:55 UTC used inquiry `inquiry_6bbbd3a2-2cdd-4d8b-bd7b-a4efbc86cd2f` in conversation `planning_mailproof_d5573555-1614-4a34-9c8b-b7d6935f0b4b`.
The signed incoming receipt for the original outgoing message completed as unmatched, and the saved inquiry had zero replies at the final 14:05 UTC read.
A separate clearly labeled synthetic reply was provider-accepted and had a signed delivery receipt, but no incoming-message webhook reached this app during observation.
It did not produce an interpreted offer.
A failed diagnostic request used an invalid idempotency-key character; a confirmed HTTP 400 preceded the corrected request.
No uncertain accepted email was resent under another key.
Controlled reply fixtures and model extraction are separate evidence from real mail receipt.
The full inquiry-to-external-reply-to-offer path is still unverified.

## Integration instructions

Review Stage 3 against `main`, Stage 4 against Stage 3, and Stage 5 against Stage 4.
Keep the explicit local PGlite override and preserve the saved database.
Do not apply migrations to shared or hosted storage or reset records to obtain a passing check.
Run the application as the sole owner of its local database directory; the worker calls it over HTTP.
The new supplier-mail migration was exercised in isolated migrated local test databases.
Production migrations remain a separate unperformed operation.

Before resuming real mail verification, obtain one different team-controlled recipient and inbox access.
Recreate a temporary forwarding endpoint, set its private signing secret, and start the local application and reply worker.
Do not expect the old localhost callback URL to receive tomorrow's reply.
Use `tools/local-rehearsal/README.md` and the feature recipes for the exact checks.

## Limitations and cleanup

Tony explicitly deferred the external reply test and replaced hosted verification with local-only work and separate stage PRs.
The product plan contains five stages; no sixth product stage is defined in the handoff.
The local payment demonstration starts from a labeled controlled quote, not a genuine supplier response.
A single continuous real inquiry, external reply, interpreted offer and payment journey has not passed.
Duplicate webhook and invalidated-offer behavior have automated coverage, not a complete live browser proof.
A complete end-to-end demo recording remains deferred with the external reply step.
Existing recordings cover individual local stages and must not be presented as one uninterrupted live journey.

At 14:03 UTC, the temporary mail webhook and Stripe test webhook were deleted.
The prior local Stripe signing configuration was restored, and the temporary mail signing value was removed.
The owned application was stopped and the forwarding process had ended.
The cleanup record is `.scratch/verification/webhook-cleanup.json`.
No production configuration, real supplier outreach, real charge or reservation was performed.
Credentials, sign-in, saved records, `.entire` and existing evidence remain preserved locally and are not part of the PR artifacts.
