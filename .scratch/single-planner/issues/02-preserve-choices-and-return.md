# 02: Keep customer choices through changes and return visits

**What to build:** A customer selects a venue from a real proposal, requests cheaper supplies, and returns to the same saved conversation with the chosen venue intact.
Reuse the existing planning selection and persistence behavior, changing only what the live journey shows is necessary.

**Blocked by:** 01: Deliver a useful proposal with one planner.

**Status:** ready-for-agent

Owner: Tony.

- [ ] Starting with a live proposal from ticket 01, select a venue in the actual local application and request cheaper supplies while keeping that venue.
- [ ] The follow-up uses the same hosted session and preserves the selected venue ID and saved selection facts.
- [ ] The supplies change when a cheaper suitable option is supported by evidence; otherwise explain that none was found without inventing savings.
- [ ] Manually verify product suitability, pack quantities, comparable prices and source support for any claimed savings.
- [ ] Reload restores the same conversation, latest proposal and customer selections without another create request.
- [ ] Close the page during hosted research and return after a bounded interval; verify the actual hosted status and restored work without a duplicate session or automatic resend.
- [ ] A provider pause or failure remains visible and preserves saved work; do not claim background completion merely because reload succeeds.
- [ ] Terra verifies the desktop journey only after the live SDK follow-up succeeds, using the exact final local code revision.
- [ ] Record the brief, session identity, selection IDs, follow-up, observed requests and final outcome without credentials; separate verified behavior from untested cases.

## Verification approach

Tony approved real-run-first verification with no new automated tests by default.
Use live SDK evidence followed by the real desktop application, not fixtures as proof of successful research.
If a run reveals a bug, reproduce and diagnose it before deciding whether to add a targeted regression test.
Run proportional existing checks for fixes and retain required existing checks before any later shipping step.
Stop only test-owned resources after the run and preserve customer sign-in and saved conversations.

## Scope limits

Keep work local with no push, merge or deployment.
Selecting an option remains a preference, not purchase approval.
No supplier outreach, transaction bridge, payment work, production migration or unrelated frontend redesign.
