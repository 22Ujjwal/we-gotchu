# Venue images implementation plan

Use executing-plans for sequential implementation and independent final review.
Spec: ../specs/2026-11-08-venue-images.md

1. Add a secure bounded public HTTPS reader and tests for forbidden URLs/IPs, redirects, deadlines, size and MIME limits. Commit after verification.
2. Add venue-scoped metadata/gallery extraction, deduplication and a four-image cap. Use an HTML parser, skip logos/unrelated candidates; test fixtures and a real official venue page. Commit after verification.
3. Add ownership-checked GET /api/planning/:id/options/:optionId/images, loading saved options without calling the agent. Verify failures leave saved proposals unchanged. Generate routes and test/build. Commit.
4. Independent branch review, contract/config/example handoff, status update. No push or deployment without fresh authorization.

## Completed evidence

All four milestones implemented locally. 517 application tests, 25 coordination
tests, typecheck and Vercel build pass. Independent review fixed one metadata
identity issue and approved the correction. Live Pearl photo example documented
in docs/team/venue-images.md. No push, deployment or frontend integration.
