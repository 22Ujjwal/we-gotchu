---
name: verify-we-gotchu
description: Verify the real local We Gotchu web app, including planning submission, sourced proposals, reload, venue inquiries and supplier replies, and the existing event screens, with recorded evidence.
---

# Verify We Gotchu

## Launch

Read package.json and .github/workflows/ci.yml; use the installed Bun version that supports the frozen lockfile.
Run `bun install --frozen-lockfile`, `bun run typecheck`, `bun run test --maxWorkers 2`, `node --test tools/team-coordination/*.test.mjs` and `bun run build` before a shipping check.
Do not confuse these checks with live provider verification.
Use the existing ignored .env.local without printing its contents.
Local planning needs Clerk configuration, NAIVE_API_KEY, NAIVE_PLANNING_AGENT_ID and PLANNING_LOCAL_DB_DIR=.scratch/local-planning-db.
Development initializes and migrates that local database on first planning access; no fixture seeding is needed.
Production requires DATABASE_URL and separately applied migrations.
Do not run hosted migrations as part of browser verification.

Check `~/.local/bin/agent-process list` and `lsof -nP -iTCP:3000 -sTCP:LISTEN` first.
Reuse only an instance whose checkout and configuration match the requested revision.
Otherwise start `~/.local/bin/agent-process run --name we-gotchu-browser-proof --ttl 1800 --port 3000 -- bun run dev` and retain the returned process ID and log.
Never open the same PGlite directory from two active servers.

## Doctor

Record `git rev-parse HEAD`, `git status --short`, the listening process and its checkout before driving the app.
In T3, use preview_status first, then preview_open if necessary.
Confirm the page is http://localhost:3000 and existing Clerk sign-in is usable.
An HTTP 200 alone does not establish authenticated API or database readiness.
Preserve the user's sign-in; if login is needed, stop at that boundary and request it through the available secure interaction.
Do not change authentication to get a passing result.

## Drive

Use the feature map in features/README.md.
Prefer snapshot roles and labels over coordinates.
For stage one, follow the homepage link named Plan with our research assistant to /planning.
Enter a complete natural-language brief in the textbox named Tell us about your event, and submit exactly once.
Observe the saved /planning/$id URL and the real proposal without injecting fixture responses.
Target 90 seconds; stop observing after 180 seconds and report a miss rather than creating another conversation.
Do not approve provider actions, send supplier mail, book or purchase as part of this research check.
Use the browser's reload command for persistence, not navigation to the same URL.

## Evidence

Before submission, start network capture if the browser supports it.
Record UTC action time and each observation time, including the first completed proposal.
Report latency as an observation interval if completion occurred between snapshots.
Keep provider-result time separate from browser-render time.
Save sanitized planning response JSON, rendered text, screenshots and available network records under .scratch/verification/.
Never include cookies, authorization headers, API keys or customer identities in committed artifacts.
Record the exact conversation URL, code SHA, configured planner version/model when known, venue and product links, price, quantity and unresolved facts.
Check source evidence and arithmetic; a category-page price is not verified product stock or a checkout total.
One user click does not prove one server create request; use network evidence or mark duplicate-request verification unavailable.
If screenshots fail, retain text/API evidence and state the missing visual proof.
A completed response with no usable requested supply is not a passing useful-proposal check.

## Cleanup

Stop only the process created by this run using `agent-process stop ID`.
Preserve local records, credentials, sign-in, .entire and evidence files.
Close only your own browser tab unless Tony requested it remain visible.
Confirm evidence files still exist after cleanup.
Never report a stopped localhost server as a currently usable URL.

## Helpers

The existing tools/agent-research-proof/planning.ts runs a live SDK proof with an input JSON file when RESEARCH_LIVE_SMOKE=1 is explicitly set.
It can spend provider credits and is not a dry run.
Its success proves the SDK path only, not the browser flow.
Use the real browser recipe above for product acceptance.

The controlled supplier-reply helper is `tools/planning-reply-proof/run.ts`.
Its exact invocation and limitations are in features/venue-inquiries.md.
It creates a new labeled test conversation without changing the source conversation, calls the real interpretation model, and never sends email.
Passing its controlled reply ID instead of the source ID retries interpretation of the same saved reply after failure.
Run it only with the local database server stopped, then start the application to inspect the result through its actual UI.
