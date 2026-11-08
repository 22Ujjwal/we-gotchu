# Leo's status

Owner: Leo.
Responsibility: frontend.
Updated: 2026-11-08T03:29:20Z
Baseline and tested code: main at ce2d672408be7defc30fad4d09db47b39ba28054.
Branch and PR: docs/leo-interface-review, local only; no PR published.
Availability: frontend and Clerk code are merged; this review handoff is local only. API consumption described below is pending implementation.

## Current result

Reviewed the request in [Ujjwal's status, line 43](https://github.com/22Ujjwal/we-gotchu/blob/ccef574bee4fdec1e3811e02fcff3e7854b444d6/docs/team/status/ujjwal.md#L43) against the current code.
The UI uses `src/lib/hostwell/fixture.ts` and the in-memory `HostwellProvider` in `src/lib/hostwell/store.tsx`.
It currently reads no backend summary or progress fields and does not poll the event API.
The booking button sets `bookedVenueId` and navigates to `/party`, which displays booked/paid copy from local data. This is simulated UI behavior, not evidence of payment or supplier confirmation, and resets on reload.

## Summary and progress field handoff

Contract 0.4's `EventView` in `src/contracts/records.ts` is the integration target returned by `GET /api/events/:id`; there is no separate `EventSummary` record in the current schema.
The following fields cover the server-backed event summary and progress requirements. This records the frontend integration target, not an already implemented consumer or approval on another owner's behalf.

| UI purpose | Fields to consume |
| --- | --- |
| Restore event and intake | `event.eventId`, `event.brief`, `event.briefRevision`, `event.status`, `event.planRevision`, `event.cancelRequestedAt` |
| Research status and missing answers | nullable `run` (`runId`, `phase`, `state`); nullable `researchResult` (`briefRevision`, `superseded`, `outcome`, `missing`, `budgetFit`, `budgetBasis`, `warnings`) |
| Options, reasons, and sources | `researchResult.candidates` (`candidateId`, `name`, `kind`, `sources`, `priceEstimate`, `priceProvenance`, `taxesAndDelivery`, `quantityInfo`, `cancellationTerms`, `verification`, `evidenceMode`, `affiliateDisclosure`, `whyChosenOrRejected`); `researchResult.recommendations` (`candidateId`, `rank`, `matched`, `unmet`, `unchecked`); `researchResult.sourceChecks` |
| Approve the exact proposal | nullable `plan` (`planId`, `revision`, `briefRevision`, `selectedCandidateIds`, `actions`, `total`, `currency`, `serviceFee`, `cancellationTerms`, `agentReasoning`, `budgetFit`, `budgetBasis`, `warnings`, `mode`); submit `planId` and `planRevision: plan.revision` |
| Individual commitments | `plan.actions` (`actionId`, `kind`, `supplierName`, `target`, `quantityOrSchedule`, `maximumAmount`, `cancellationTerms`, `sourceUrl`, `mode`) |
| Approval validity | nullable `approval` (`planId`, `planRevision`, `expiresAt`, `revokedAt`) |
| Payment and refund | nullable `payment` (`amount`, `currency`, `state`, `refundState`, `refundReason`, `mode`) |
| Booking and cancellation evidence | `attempts` (`attemptId`, `actionId`, `kind`, `state`, `actualAmount`, `providerReference`, `evidence`, `errorReason`, `mode`, `updatedAt`), joined to actions by `actionId` |
| Progress log | `progress[]` (`eventId`, `sequence`, `actor`, `message`, `createdAt`); `event.progressSequence` is the event-level cursor |

Render money from integer minor units with the record's currency; do not reuse the fixture's decimal EUR arithmetic for server totals.
Treat absent nullable records as pending/unavailable. A research result is read-only; approval requires a current backend Plan.
Use `event.status`, payment/refund states, and attempt evidence for completion, including `unknown`, partial completion, and refund pending. Navigation and progress messages do not establish success.
Show each payment/action's own `live`, `test`, or `simulated` mode.

For progress, initially fetch without `afterSequence`, then request `?afterSequence=N` using the last accepted cursor. Merge entries by `(eventId, sequence)` in ascending sequence order; incremental responses contain only the new log entries but still refresh the summary records. Reset the log and cursor when changing events; fetch the full view after reload. `run.lastSequence` belongs to provider research polling and is not the UI log cursor.
Render `customer` as Human, `agent` as Agent, and preserve `system` as System. Do not relabel a system event as an agent action.

The current design also uses photos, descriptive features, VAT/receipt line breakdowns, and an event end time. Contract 0.4 has no dedicated fields for these. They remain fixture-only presentation until Leo and Ujjwal agree on an optional presentation payload or reduced UI; do not invent verified supplier details or change shared schemas independently.

## Clerk root review

No blocking finding in `src/routes/__root.tsx` for the Clerk change introduced in 8529f83da7bb0ce8caccff503364e177db676dc4, reviewed with the subsequent frontend changes at the baseline above.
`ClerkProvider` wraps `HostwellProvider` and route children inside the document body; `HeadContent` and `Scripts` remain present.
This placement matches the [Clerk TanStack React Start quickstart](https://clerk.com/docs/tanstack-react-start/getting-started/quickstart).
The installed SDK 1.7.11 reads initial auth state from Start context, supplied by `clerkMiddleware()` in `src/start.ts`; no extra root loader is required by this setup.
The root imports no server auth helper or secret. Customer API identity remains behind `requireCustomerId()` in `src/server/auth.ts`.
Wrapping the root supplies context; customer API handlers enforce authentication and ownership. This review does not claim the fixture UI is protected or the login flow is verified.

## Runtime evidence

- `bun install --frozen-lockfile` restored missing local dependencies without changing manifests or the lockfile.
- `bun run typecheck`: passed at the baseline above after dependency installation.
- `bun run build`: passed, including client, SSR, and Nitro output, at the baseline above.
- Clerk sign-in/sign-up, session restoration, and authenticated/unauthenticated API behavior: runtime unverified in this review.
- Frontend summary/progress API integration, real payment, booking, cancellation, and refunds: runtime unverified; the UI remains fixture-driven.

## Next step and blockers

Leo: replace fixture-only booking state with event identity, full EventView restoration, polling, approval/Checkout, and cancellation/refund rendering against the shared contract fixtures first.
Ujjwal and Leo: agree on fixture-only presentation gaps before preserving them in the API-backed UI; no shared contract change is made by this review.
Team: the status request for a shared Clerk application still needs runtime verification; this review neither claims nor copies credentials.
