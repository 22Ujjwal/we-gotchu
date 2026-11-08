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

## Deferred minor

A failed image API request is not retried while the same venue source remains mounted. Reloading the page retries it; ordinary research polling intentionally does not restart image reads, preventing slower image fetches from being continually aborted. An explicit photo retry is a future improvement. Repeated identical photo credits are also visually verbose, but attribution remains present.

## Integration boundaries

These checks prove controlled frontend/API compatibility and local rendering. They do not establish hosted Clerk sign-in, a real Naive research result, supplier availability, delivered supplier mail, completed bookings or a live external-agent connection. Customer approval and payment boundaries remain intact. Public external-agent enrollment, admission and route mounting remain separate work.
