# Customer workflow verification — 2026-11-08

Branch: integrate/agent-connect-tony, local only. No push or deployment.

## Customer-page cleanup

Removed the homepage assistant shortcut, routine ready/activity/footer narration, and customer conversation history. Non-ready research status/recovery is placed beside Ask for changes, below the venue options. Actual request errors and explicit approval controls remain. Stored messages are unchanged. Single supply cards align with the centered form; long summaries/questions retain original context under Details.

Native Chrome screenshot confirmed the options heading is first, with no top update button or history, and the real Pearl rooftop photo renders in the saved venue card with attribution. Earlier desktop screenshots confirmed supply/form alignment. The attempted final lower-page capture was interrupted by the native browser reporting no window; no new mobile screenshots were completed. The session retains screenshot evidence.

The real research-only comparison produced a Pearl proposal. A later name-only refinement ended uncertain; it was not resent. Saved proposal/image remain visible, but selection is correctly disabled while the research outcome is uncertain. This is not a fully passing continuous customer journey.

## Nine-step audit

1. Brief: structured planning creation and persistence implemented; no fresh structured intake browser submission in this pass.
2. Research: live progress/terminal proposal previously observed; revised request uncertainty remains a provider-flow limitation.
3. Options: up to three venues rendered; exactly three are not guaranteed, and additional venues beyond the first three are not shown.
4. Customize: versioned venue/supply selection and estimated breakdown implemented and tested with controlled responses.
5. Arrange: customer email/contact permission and background request implemented. Separate manual inquiry/offer controls remain a competing path; recommend operator-only recovery as a subsequent increment.
6. Replies: durable webhook/jobs and interpretation implemented. Automatic arrange outreach/follow-up currently gated to development and controlled supplier. Open page stops polling at awaiting_reply, so email/manual refresh is needed.
7. Offer: automatic complete-offer email exists for controlled development arrangements; continuous live journey not demonstrated here.
8. Payment: explicit complete/current-offer approval precedes sandbox Checkout. Payment tests are controlled, separate from research readiness.
9. Result: payment and simulated execution wording are distinct in planning payment UI, but explicit supplier confirmation status/final customer receipt remain unfinished. Do not equate paid with confirmed real booking.

## External agent connection

Official MCP client tests: 5 tests / 54 assertions; isolated typecheck/build pass. Gateway, HTTP boundary and planning bridge: 34 tests pass. Persisted fixture journey covers create, poll, selection, database/client restart, refinement and poll; review links/selections persist. Checks cover ownership, scoped grants, revocation, expiry, stale versions and safe replay. No outreach, approval, payment or booking callbacks occur.

Not a hosted service yet: no external endpoint mounted, no production enrollment/durable grants/admission, no network/proxy/TLS or real Grok/Muse/Dot verification. Existing internal Naive MCP is a separate interface.

No real supplier contact, purchase, charge, hosted migrations or provider configuration changes in this pass.

Final checks: 763 application tests across 71 files, 31 tooling tests, root typecheck and Vercel build pass. Separate official MCP package checks above also pass. Existing jsdom window.scrollTo warnings are non-failing.
