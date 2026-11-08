# Parallel ownership during stage three

Tony clarified that his team owns all of stage three.
Ujjwal's parallel work is outside the inquiry flow.
This replaces the earlier proposed split of supplier-mail work.

## Tony owns stage three

Tony owns inquiry drafts, approval to send, supplier-mail delivery, inbound replies, persistence, and customer UI integration.
Reserved areas include planning contracts, planning provider behavior, conversation services and storage, planning API commands, planning UI, and new supplier-inquiry email modules.
The relevant directories are `src/agent/planning`, `src/server/planning`, and planning components and clients under `src/components/hostwell` and `src/lib/hostwell`.
Tony owns generated route-tree updates during integration.
Do not independently edit these areas for image lookup or hosted readiness.
Coordinate shared database schema, migrations, runtime, or package-file changes before either person starts editing them.
The existing customer quote-ready email must remain separate from supplier inquiries.

## Ujjwal's first independent task: venue images

Ujjwal owns a new isolated venue-image module, its endpoint, provider configuration, and its own focused verification.
Suggested owned files are `src/server/venue-images/**` and a new image endpoint route.
Agree on the exact route filename before implementation; Tony owns any generated route-tree update.
Do not modify the planning proposal schema, agent prompt, conversation persistence, or planning UI.
Read saved venue options through the existing ownership-checked repository boundary.
If that boundary needs a change, ask Tony for the smallest interface addition instead of editing it independently.
Return image URL, source page, required attribution, and provider, or an explicit no-image result.
Image retrieval must not delay research or prevent the proposal from rendering.
Cache only according to the chosen source's rules, and reject uncertain venue matches.
Source-page fetching must reject private/internal destinations and unsafe redirects.

Ujjwal's verification before handoff:
- Retrieve a correctly matched image for an actual saved venue and inspect the image itself.
- Verify attribution and source identity, not just HTTP success.
- Check no-image, ambiguous-match, provider timeout, and cache behavior.
- Check conversation ownership and invalid option IDs.
- Verify a failed image request leaves the existing planning result usable.
- Run focused checks, typecheck, and the required shipping suite on the final revision.
- Report exact commit, request/response contract, configuration names without secrets, and local versus hosted evidence.

Tony then wires the response into the existing planning cards and verifies the actual browser rendering.
Ujjwal should not duplicate that frontend work.

## Ujjwal's next independent task: hosted planning readiness

After the image work, Ujjwal can prepare and verify hosting for the existing planning flow on an agreed deployed revision.
This is configuration and operational verification, not permission to rewrite the planner or inquiry flow.
Verify Clerk sign-in, Neon connectivity and migration status, planner configuration, and the deployed commit.
Do not migrate or change production configuration silently; coordinate the exact deployment window and revision.
Do not enable the public planning entry before its hosted acceptance run passes.

Hosted acceptance should cover one signed-in create, a completed or explicitly partial proposal, a selected venue, a follow-up in the same conversation, and reload restoration.
Compare selected venue identity before and after the follow-up.
Where evidence is available, confirm the same provider session and one accepted initial message and follow-up.
Report provider failures separately from application failures, and mark missing evidence unverified.
No supplier outreach, purchase, or real payment is part of this check.
Use an isolated test conversation and preserve other records.

## Shared integration gates

Each owner verifies their own work before handoff.
A handoff includes exact SHA, owned files, response or configuration contract, test commands and results, actual runtime evidence, and unresolved limitations.
Passing unit tests or a deployment build does not establish live provider or browser behavior.
Tony integrates only the reviewed commit and checks the combined customer journey.
No shared-file edits, pushes to another owner's branch, or duplicate implementation without coordination.

## Deferred work

Live activity paper slips, research-result caching, and general UI refinement remain separate from stage three.
The planning-to-payment bridge follows a stable inquiry and offer flow; do not start a speculative duplicate transaction model now.
