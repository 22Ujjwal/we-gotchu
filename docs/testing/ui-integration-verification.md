# Planning UI integration verification

Owner: Ujjwal. Branch: `integrate/agent-connect-tony`. Local implementation; no push, PR, merge to main or deployment. Includes Tony's demo branch `8a06de34bcc359fab8f8d9b0387f51c5e2305377` and main `ba3f747e1d856f4f461fa696b2380ad616ad950b`.

## What changed

Preserved Leo's layout, typography and interaction design while connecting and repairing the saved planning journey. Inquiry disclosures and paused activity are visible; research refresh and selection removal work; uncertain send recovery sits near the top. Existing inquiry delivery disables a competing arrangement request, matching the backend guard. Updated stale test selectors/fixtures without removing explicit approval, ownership or saved-state checks.

Venue images now load independently through the authenticated saved-option images endpoint. Results are capped at four with attribution. Missing/failed images leave the proposal usable; expired conversation/source responses cannot replace current images. The carousel skips broken URLs, compacts its all-failed fallback and resets when the source list changes.

Main's activity dial receives real saved planning progress. The loader tolerates partial briefs. Main's supply-inclusive pricing and homepage animation changes coexist with Tony's structured planning submission.

## Verified implementation

Tested source commit: `ee61df14e8badba9d0989e6be90287ed8ecb0400`.

- `2051c67`: integrate Tony's planning flow, repair disclosures/recovery and connect venue images.
- `44b1ae2`: skip failed photo URLs and reset changed galleries.
- `ee61df1`: integrate main's activity animation/pricing updates and fix live progress/partial briefs.

Final checks: **732 application tests**, **31 coordination/rehearsal tests**, **5 official MCP client tests**, root and SDK typechecks, Vercel production build and SDK bundle pass. Application tests ran with one worker. jsdom reports existing unsupported window.scrollTo warnings; browser checks use actual scrolling and reported no JavaScript errors in exercised states. No timeout limits were increased.

Commands: `bun run test --maxWorkers=1`, `bun run typecheck`, `node --test tools/team-coordination/*.test.mjs tools/local-rehearsal/*.test.mjs`, `NITRO_PRESET=vercel bun run build`; in `integrations/arrange-agent-connect`, `bun run test`, `bun run typecheck`, `bun run build`.

## Evidence and limits

Parallel agents handled planning UI repairs, API/contract/image-hook work and browser verification. A separate read-only reviewer found no blocking issue in the authored repair/image changes. Later main-integration fixes have reproducing regressions and focused verification.

Browser evidence uses actual components and the actual planning-session hook, with controlled API responses and a test Clerk identity. Supplier/provider requests were blocked; only explicitly allowed public font assets were fetched for typography checks. Local photos exercise image rendering and errors. No real inquiry, arrangement, research credit use, purchase, payment or hosted migration occurred.

The local evidence directory is `.scratch/verification/ui-integration/` (ignored, preserved). Its `REPORT.md`, JSON records and reproducible scripts distinguish fixture evidence from live behavior. Frames include desktop/mobile research, options, selected venue, inquiry approval, accepted/uncertain sends, blocked states and errors; loading transitions at initial/mid/ready times in normal/reduced-motion modes; and image success, no-image and all-404 cases. Public fonts were verified loaded in typography captures. Checks cover horizontal overflow, JavaScript errors, versioned selection requests, approval gating, visible uncertainty recovery, keyboard focus and carousel controls.

Final combined-main visual run at `ee61df14` produced **52 final PNGs**: 30 state/image/font/partial-brief cases had no page errors or horizontal overflow; four loading-transition cases verified the changed backend progress string and automatic ready state. Selection, approval gating, focus, uncertainty safeguards, carousel controls and all-404 fallback passed. Root inspected representative desktop/mobile and live-progress frames; visual agent inspected layout and typography. The owned harness server was stopped after capture; files remain available.

Selected local frames: `.scratch/verification/ui-integration/images-desktop-available.png`, `combined-main-mobile-uncertain.png`, `transition-mobile-no-preference-mid.png`, and `typography-desktop-options.png`. Screenshots are ignored local artifacts rather than deployed product evidence.

## Photo recovery follow-up

Transient image API failures now retry after 1 and 2 seconds, then expose Retry photos without requiring a reload. Successful venue images remain visible. Authentication errors, invalid payloads and genuine no-image results are not retried. Research polling does not restart reads; scope changes and unmount cancel pending work. Repeated identical photo credits remain visually verbose, but attribution is present.

The real development app was opened in Chrome at localhost:3000. The homepage and Clerk development sign-in rendered, and planning correctly required sign-in. Authenticated research/image verification is pending user sign-in; this is not a live journey pass. This check uses an isolated local planning database and does not configure email or payment providers. No supplier, payment, hosted migration or deployment action was performed.

## Integration boundaries

These checks prove controlled frontend/API compatibility and local rendering. They do not establish hosted Clerk sign-in, a real Naive research result, supplier availability, delivered supplier mail, completed bookings or a live external-agent connection. Customer approval and payment boundaries remain intact. Public external-agent enrollment, admission and route mounting remain separate work.

Retry implementation: `7cc8679`. Fresh verification: 741 application tests and 31 tooling tests pass, typecheck and production build pass, diff check clean. Independent review found no blockers. Retry regression tests use controlled responses; live signed-in photo recovery remains unverified.

## Signed-in local retry verification — 2026-11-08

Tested source `02d4fe543cc24963af58669d31bdc7d729eacde7` in native Chrome at localhost:3000. User completed Clerk sign-in. Submitted the agreed San Francisco / 20 guests / December 12 at 18:00 Pacific / USD 500 / paper plates / USD 0 cancellation-loss research-only brief once, around 17:34:53 UTC. The app opened a saved conversation and progressed from Checking sources to Your options are ready.

Conversation: `/planning/planning_6579677d-6e9a-4e21-afc2-e2afbce9cf32`. The real result provided El Lopo as a provisional adult-only venue and one 24-plate pack with a displayed $1 subtotal before tax/delivery. It explicitly left venue quote, availability, cancellation terms and budget compliance unverified and asked for the missing end time. This is an honest partial research result, not a confirmed bookable offer. Prices/source claims were displayed by the planner, not independently audited in this UI check.

Browser Reload restored the same URL, proposal and supply details. Photo not available remained visible without preventing use of the proposal. No successful live image or transient-error recovery was observed; bounded retry recovery remains supported by controlled regression tests. Browser inspection and screenshot capture intermittently timed out, so exact completion latency and a final proposal screenshot are unavailable. An earlier live saving-screen screenshot and accessibility observations were returned in the session. No network capture was available to establish exact request counts.

No revised brief, supplier contact, approval, Checkout, purchase, payment, hosted migration or deployment was performed in this run. Local app remains running for user inspection. This supersedes the prior sign-in-pending note; structured homepage submission and changed-brief behavior remain outside this run.

## UI copy and image matching cleanup — 2026-11-08

User-directed cleanup removes repeated ready/activity/footer explanations, centers single supply cards with the change form, and presents a short summary/question with complete original wording under Details. Recovery remains visible and centered; empty operator panels are omitted; actual approval controls remain. Conversation history is collapsed below the primary flow. The homepage assistant shortcut is removed; receipt history uses Activity.

Implementation milestones: `12c7e32` (UI) and `f2aaa17` (caption corroboration). Final combined suite before the small homepage/receipt copy sweep: 758 application tests, typecheck and build passed. Focused copy-sweep checks are recorded in the session.

Native Chrome screenshots confirmed centered supply/form alignment and compact summary/recovery. Routine Research activity and footer narration are absent. No new mobile capture was completed. The Pearl comparison completed using the real planner; a subsequent request to simplify its name ended uncertain and was not resent. The earlier saved proposal remains available. This provider outcome is separate from the UI/image fixes.

The exact saved name `The Pearl — San Francisco (budget mismatch on published rates)` failed original matching. The fix requires a page title matching the business plus a caption corroborating business and city, then admits only business-matched room captions. Metadata extraction and URL/DNS/template/logo guards remain unchanged. Root and reviewer each verified one live rooftop image from the official brochure; root downloaded and visually inspected it at `.scratch/verification/ui-integration/pearl-live-rooftop.webp`. Final in-page rendering after the extractor fix was not confirmed because browser interactions were interrupted by tab changes. No claim of four photos: this page yields one.

No supplier outreach, purchase, payment, hosted change or push. Live research-only prompts and public source/image reads occurred.


## Local browser recheck, 2026-11-08 18:37 UTC

Revision: `9144120cb37936a3e620e7d4073aa630a111c3cc`. Port 3000 process 16995 was confirmed to run from this integration checkout. Native Chrome opened the existing saved conversation above. Browser Reload retained the same proposal URL and rendered The Pearl rooftop photograph. A screenshot returned in chat confirms the actual photo, shortened fact wording, and absence of the removed proposal Details disclosure and keyboard hint. The source page provides one photo, so live gallery navigation was not available.

The saved research state remains uncertain and venue/supply selection remains disabled. This is not a successful fresh research or selection test. The old saved venue title and source attribution are still verbose; local prompt changes do not rewrite saved records or update hosted agents.

Further scrolling encountered `noWindowsAvailable`; subsequent Chrome screenshots were blank and the content accessibility tree disappeared. Requested that the user restore the visible local window. No additional live image-failure, mobile, selection or fresh research verification is claimed.

Controlled checks at this revision: 94 tests passed across planning-chat, ui-photo, planning-images, venue-images and venue-images-http. These cover gallery navigation, failed assets, missing-image fallback, bounded retry, stale results and ownership. They are not live browser evidence. No supplier messages, bookings, payments, hosted configuration changes or push occurred.


## Integrated local automation, 2026-11-08 19:27 UTC

Code: a31d85a, documentation head 7e707e0. Process inspection found no old Playwright, Chromium automation, Vitest or proof runners; earlier helper agents were complete. Only the matching local Vite server remained active.

Native Chrome restored the saved selected venue after reload. Change venue returned to the options screen. A successful screenshot in chat shows The Pearl rooftop photo, script Updated event label, enabled Choose this setting, and removed photo-source caption. A subsequent choose click did not establish a confirmed transition before the user switched tabs; do not count it as a second successful selection proof. Earlier selection proof remains separately recorded.

The saved uncertain session still disables extras, new research messages and arrangement submission. No supplier or payment action was taken. Visible follow-up issues: the saved option card still has its old long title; manual Prepare venue inquiry remains below the main flow. Tony's newer unmerged flow cleanup was not adopted implicitly.

Fresh controlled automation: 103 tests passed across planning-chat, ui-photo, planning-images and connected-journey. This includes navigation, image fallbacks/retry and event API response handling, not a new live provider journey. Automation finished; local server and user tabs were preserved. No push or deployment.


## Saved planning adopts Leo's venue layout, 2026-11-08

Local branch: `integrate/leo-main-preserve-local`. Main baseline remains `4f312b9`.
Commits: `e907561` extracts shared receipt styling; `4d57ee8` connects saved planning to the photo, description, extras and paper estimate layout. No push, PR or deployment for these changes.

The selected page no longer renders the redundant Updated event heading or beige arrangement card. Real selected items feed the receipt. Missing totals, fees and cancellation terms remain unconfirmed; no fixture prices or inferred money amounts are used. Email and the existing guarded arrange action sit beneath the receipt. Follow-up questions remain beside the changes form. Approval, payment and supplier contracts are unchanged.

Verification: 104 focused tests across planning-chat (50), connected-journey (28), photo and planning-image hooks (26); typecheck and production build pass. Planning-chat was rerun after restoring follow-up questions. Native Chrome screenshot confirms the real saved Pearl photo, shared paper receipt and aligned extras. Browser navigation was attempted but no transition was observed in this run; controlled navigation tests pass. No fresh mobile screenshot or successful arrangement submission is claimed.

The saved local event remains uncertain and has no structured brief metadata. Arrange and extras remain disabled by existing guards. No real provider research, supplier contact, booking, purchase or payment occurred. Tony's newer unmerged flow changes remain outside this branch.

