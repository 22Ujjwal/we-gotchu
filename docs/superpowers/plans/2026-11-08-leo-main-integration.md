# Leo main integration

Goal: adopt Leo's merged frontend updates while preserving Ujjwal's local planning, image and agent-connection work.

User direction: use Leo's layout, retain working processes, avoid extra copy, and flag semantic conflicts rather than choosing a side blindly. Do not push.

Architecture: merge main into a new local integration branch in the existing isolated checkout. Keep the original branch at 971208e as a recovery point. Preserve the distinction between demo fixtures and authenticated saved planning.

- [x] Fetch and inspect main at 4f312b946846bd1b52db194d882f3e676ba147bc.
- [x] Inspect overlaps and open PRs (connector returned none).
- [x] Create integrate/leo-main-preserve-local from integrate/agent-connect-tony.
- [x] Combine the sole textual conflict in .env.example, retaining both sets of variable names with empty values.
- [x] Verify Leo's arranging screen, event page, fixture data and party route match main exactly.
- [x] Install with frozen lockfile; run typecheck, build and tooling checks.
- [x] Full application suite: 777 tests in 72 files passed. Merge committed as a31d85a.
- [x] Record exact integration commit and verification limitations in Ujjwal's status.

Review focus: keep authenticated planning separate from local demo navigation; preserve image retrieval/retry; retain uncertain-research selection and action guards; include generated routes; do not execute demo email, supplier contact or payment during verification.

Tony's newer feat/planning-company-actions commits are outside this integration. No schema, dependency or migration changes were needed for merging main. Browser accessibility inspection restored the selected local venue after reload, but screenshot capture returned blank; visual alignment is not freshly verified.
