# Leo's status

Owner: Leo.
Updated: 2026-11-08T01:05:00Z.
Baseline: main at a54e054 (merge of PR #10).
Branch and PR: frontend/leo-app-shell; PR link is recorded in the PR description and the handoff reply.
Availability: on branch.
Tested commit: d3db7e6 (app shell); this status commit changes documentation only.

## Current result

The starter page is replaced by a We Gotchu app shell in src/routes/__root.tsx, src/routes/index.tsx, and src/styles.css.
The shell has a skip link, header, main landmark, visible keyboard focus, and reduced-motion styles.
Router devtools load only in development.
The landing page describes the product and states that event intake is not available yet.
No intake, plan, approval, payment, progress, or cancellation screen exists yet.
No routes were added, so src/routeTree.gen.ts is unchanged.

The framework baseline is TanStack Start with Bun.
PR #6 (Next.js workspace migration) was closed without merging on 2026-11-08T00:43Z, so this branch does not use it.

## Runtime evidence

All frontend behavior is unverified against any backend; no API, fixture, or supplier integration exists to call.
Checks run at d3db7e6:

- bun install --frozen-lockfile succeeded.
- npx tsc --noEmit -p . exited 0.
- bun run build succeeded.
- bun run preview served / with the title We Gotchu, the skip link, and the landing copy, and no devtools markup.

No manual screen-reader or browser keyboard test has been run yet.

## Contracts and dependencies

Contract: draft 0.1 in docs/contracts-draft.md, still proposed.
src/contracts and shared fixtures do not exist on main or on any pushed branch at a54e054.
The frontend journey is blocked on Ujjwal's foundation PR (schemas, fixtures, and API boundary).
I will import those fixtures and will not maintain my own copies.

Proposed UI-consumer review of draft 0.1 for Ujjwal; none of these are agreed yet:

1. Define the progress entry returned by GET /events/:id/progress, for example sequence, occurredAt, kind, actionId, a customer-readable message, and mode.
2. Define the EventBrief.missingFields shape, ideally as stable field keys the UI can map to inputs and follow-up questions.
3. Define the cancellation quote record, including quoteId, per-commitment maximum loss and expected refund, the terms revision accepted by POST /cancellations, and expiresAt.
4. Clarify whether commitmentIds are actionIds or a separate Commitment record.
5. Add a way for a Candidate to explain how it meets the brief, because the frontend brief requires showing that.
6. Use one Money shape everywhere, such as amountMinor plus currency, including priceEstimate.
7. Enumerate EventSummary.nextRequiredAction values and expose the derived partial outcome as a field.
8. State how the summary signals a stale plan or revoked approval besides a 409 response.
9. Include fixtures for a stale plan and a failed action, alongside the fixtures already listed in the contract draft and foundation task.
10. Document how the browser session identifies the customer for ownership checks.

Tony may need to review items 1, 3, 4, and 5 because agent and supplier results feed those records.
PR #11 (Tony's research spec) is open and documentation-only; it does not change contracts or frontend paths.

## Next step and blockers

Next: get Ujjwal's response to the review items, then review the foundation PR's schemas and fixtures as the UI consumer.
Blocked: intake, plan, approval, event view, and cancellation screens wait for the shared fixtures from Ujjwal.
Unblocked meanwhile: frontend-only layout and accessible form primitives that do not encode contract shapes.
