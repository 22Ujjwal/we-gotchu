# Research result clarity

This change addresses four findings from the local research run on main `5b180cc`.
It does not change request deadlines, investigation scheduling, provider reconciliation, shared contracts, or booking behavior.

The customer result uses a short outcome and budget summary with the existing card layout and styling.
Raw warnings, source checks, timestamps, and field evidence remain available in collapsed details.
Simulated options remain explicitly labeled, unknown costs remain unknown, and an absent plan still cannot be approved.
Affiliate disclosures remain visible.

Product discovery now includes the event occasion along with supply needs and guest count.
Capacity excerpts require a numerical capacity statement instead of matching any mention of guests.
The excerpt remains unverified evidence, not a confirmed numerical capacity or availability claim.
Sentence-ending punctuation is preserved without adding another period.

Failure finalization retains saved evidence and clears recommendations instead of invoking an artificial failing ranking function.
It still records the actual terminal warning and preserves uncertain-operation cleanup requirements.
This does not resolve the separate Naive agent-creation investigation.

## Verification

Regression tests first reproduced irrelevant capacity prose, the missing occasion, the false provider warning, and expanded diagnostic output.
Controlled tests cover the fixes and retained no-plan, unknown-cost, simulated-evidence, and payment boundaries.
Run `bun run test --maxWorkers 2`, `bun run typecheck`, `bun run build`, and `node --test tools/team-coordination/*.test.mjs` with Bun 1.4.4.
No paid provider run, supplier contact, payment, or database mutation is needed to verify these changes.
New discovery behavior affects future runs; saved research records are not rewritten.
