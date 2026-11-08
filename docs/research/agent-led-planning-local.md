# Local agent-led planning handoff

Status: named team configured; local browser create/reload passed; live proposal blocked in the observed SDK run by specialist tool approvals.
No push, PR update, merge, Vercel deployment or hosted migration was performed.
Hosted Naive configuration was updated as explicitly authorized.

## Customer flow

The authenticated homepage accepts a natural-language event brief.
New conversations live at /planning/$id and use one hosted session for research and follow-ups.
The customer can select one venue and multiple supply options, then request changes in chat.
Selections are saved by the application, separately from model output.
Cards show source-backed published facts and estimates without requiring a confirmed booking.
Reload reads the saved conversation and does not create another session.
Old /events URLs remain compatible with existing records.
New planning conversations do not call the old discovery/investigation/ranking loop.
Approval, payment, cancellation and transaction contracts are unchanged.

## Local configuration

The existing .env.local contains the actual key and the following non-secret settings:

```dotenv
NAIVE_PLANNING_AGENT_ID=agt_95n3aqvyk5qhpd4k9z5pc7bnxt
PLANNING_LOCAL_DB_DIR=.scratch/local-planning-db
```

The runtime requires NAIVE_API_KEY and uses the configured hosted agent.
Monid authentication lives in the agent-bound vault credential, not in prompts or browser code.
Only development mode honors PLANNING_LOCAL_DB_DIR.
It applies committed migrations to that local PGlite database and does not use DATABASE_URL for this conversation flow.
Production requires DATABASE_URL and a separately authorized migration.
Do not run the hosted migration command for this local test.

Check for an existing owned server before starting one.
Start a temporary local server with:

```sh
~/.local/bin/agent-process run --name arrange-planning-local --ttl 1800 --port 3000 -- /tmp/ticket04-bun/bun-darwin-aarch64/bun run dev
```

Use the returned process ID to stop it after testing.
No web server was left running by this implementation pass.

## Hosted configuration and evidence

The retained lead agent is agt_95n3aqvyk5qhpd4k9z5pc7bnxt, now Tom at configuration version 3.
Its team definition is src/agent/planning/team.ts, built on the research instructions in definition.ts.
The vault is vlt_gan30nrft94yqfgr5qkxqar8hm and its credential is vcr_wr4ang1h8q72ftrsr57p96d7z4.
These IDs are non-secret.
This configuration is research-only in purpose and is not a shared execution or cancellation agent.
The session budget remains USD0.50; the reusable agent's monthly ceiling is USD20.
Monid usage is billed separately.

The direct MCP inspection test passed in session ses_r4fgqb4jm7ap524vfa1915p2y4.
Its tool.completed event contains the actual channel3 /v1/search specification.
That session was stopped.
This proves authenticated direct tool access, not a complete research result.

Subsequent attempts encountered intermittent provider errors.
A captured PATCH response returned HTTP429, code rate_limited, type rate_limit, message "the service is at capacity", Retry-After1, request ID req_z9a7r95mpw7707n07wwwqw07dm.
The configuration update later succeeded.
The application transport retries only explicit HTTP429 rejections, at most twice, preserving the exact body and idempotency key inside one 45-second deadline.
It does not retry network failures, timeouts or server errors on writes.
The service deadline is 55 seconds and its persisted write lease is 90 seconds.

Live proof records are ignored under tools/agent-research-proof/output:

- planning-8d9868b3-d0d8-4523-bc5d-9557448d0d61 created ses_g2n225gafcyhzga7ya4gjhy5n8, then a status read hit429; the session was stopped.
- planning-6da8a4f8-96b5-44a7-bc48-8a737b044e33 received429 before a session ID was returned.
- planning-7682e2c6-f441-4152-82fd-326ad53e661e timed out during session creation; no session ID was returned.

The first read-only reconciliation attempt also timed out.
A subsequent complete session listing succeeded and found no session with metadata.conversationId=7682e2c6-f441-4152-82fd-326ad53e661e.
This is a point-in-time provider observation, not proof that the timed-out request never arrived.
The create idempotency key is planning:7682e2c6-f441-4152-82fd-326ad53e661e:7682e2c6-f441-4152-82fd-326ad53e661e:start.
Do not silently replay that write with a different request body or key.
No full live research turn, live follow-up, or background completion claim is made.

## Verification

Before the named-team change, the integrated code passed these commands using Bun1.4.4:

```sh
/tmp/ticket04-bun/bun-darwin-aarch64/bun run test --maxWorkers 2
/tmp/ticket04-bun/bun-darwin-aarch64/bun run typecheck
/tmp/ticket04-bun/bun-darwin-aarch64/bun run build
node --test tools/team-coordination/*.test.mjs
git diff --check
```

Application tests: 437 passes in 39 files.
Coordination tests: 25 passes.
The tests include real rendered components with controlled fetch, real migrated PGlite with a controlled provider, HTTP handlers, same-session continuation, selection persistence, CAS conflicts, close/reopen, and bounded transport retry behavior.
Desktop browser verification at d280337 passed existing Clerk sign-in, one keyboard-submitted create with HTTP201, working progress, and same-URL reload with GET requests only.
No options arrived within 3 minutes 53 seconds, so selection, source facts and follow-up remain unverified.
The worker closed its browser tab and stopped its local server after this bounded test.
The final desktop run should create a real conversation, receive useful options, select a venue, ask for cheaper supplies, reload, and verify the selected venue and same conversation remain.
It should separately check return after closing the page during hosted research.
Do not treat controlled tests as proof of these live outcomes.

## Follow-up team

Tony proposed a named product team inside Naive.
The suggested roles are Tom as event lead, Maya for venues, and Sam for supplies.
The named team is now configured and read back from the provider:

- Tom (Event lead): agt_95n3aqvyk5qhpd4k9z5pc7bnxt, version 3.
- Maya (Venue researcher): agt_qcnpjxe84z0nm9cbr3t76n4akb, pinned at version 1.
- Sam (Supplies researcher): agt_7pj1hmzyrjtbzw6ae8d5z25f8v, pinned at version 1.

Both specialists have their own agent-bound Monid credential in the existing vault.
Tom uses the native coordinator roster and wait:true delegation, with board scheduling disabled.
The specialist definitions do not allow further handoffs.
The application treats awaiting_delegation as working and does not publish an old proposal while teammates are running.
No complete live team research run has been verified.
The existing CEO and unrelated ping-test agent were not changed.

The setup command defaults to a dry run:

```sh
/tmp/ticket04-bun/bun-darwin-aarch64/bun --env-file=.env.local tools/agent-research-proof/team-setup.ts
```

RESEARCH_LIVE_SMOKE=1 explicitly applies the setup.
It reuses saved resource IDs and refuses to repeat an operation recorded as uncertain.
Do not run the older single-agent configure.ts against Tom; it now refuses to overwrite a coordinator.
The ignored output/team-setup.json stores configuration IDs and setup progress, never credentials.
The live planning.ts proof now records the actual agent version and thread events so a later test can establish that both specialists were called.

Provider behavior was checked against [roster documentation](https://vetta.sh/docs/team/rosters-and-versioning.md) and [delegation documentation](https://vetta.sh/docs/team/delegation.md).
The coding sessions for API/storage and UI finished their assigned local stages and were integrated here.

## Named-team change verification

After the team change, the focused planning/provider/storage tests passed 34 tests in 9 files.
Typecheck and git diff --check also passed.
The regression first reproduced premature completion while the provider was awaiting_delegation, then passed after the fix.
No additional research session was started during team configuration.
The next live run must show thread creation and results from Maya and Sam, a merged Tom proposal, and a same-session customer follow-up.
While provider requests are unreliable, controlled API/UI testing and planning the first real supplier procurement remain useful independent work.
Supplier outreach, payment and actual procurement were not implemented or performed here.

## Parallel verification at d280337

The full application suite passed 440 tests in 40 files using `bun run test --maxWorkers 2`.
The browser conversation is planning_cd922591-eed0-4247-affb-fd5801f3f2e2.
Its remote research session was not canceled by browser QA; closing localhost does not prove hosted work stopped.

The separate SDK proof ef65f267-94dc-49e7-842d-195dc6af84c7 created session ses_0y7kfxcjg220f3y4kj923vj93z with Tom version 3.
It remained at sequence 44 with awaiting_delegation until the 240-second observation window expired.
Parent cancellation was acknowledged.
A subsequent read of 45 events returned HTTP200 with request ID req_dfvey8vh6sphb6zpbja9bkbsq4.
Tom listed the intended team, delegated both tasks with wait=true, and parked with two outstanding tasks.
Sam session ses_7sem92dbne3pav57hgb2n5yvvc and Maya session ses_zv894n0xt1vxj5pscf6tw54f7a both returned idle with stop_reason awaiting_approval.
Sam's pending tool is monid.monid_inspect for channel3 /v1/search.
Maya's pending tool is monid.monid_discover for context.dev web scrape markdown.
Both tool.confirm records contain read_people=true despite the configured tool allow permissions.
Cancellation was subsequently acknowledged for both SDK-test specialist sessions; the browser conversation was left unchanged.
This establishes the immediate wait cause in this SDK run, not the platform policy behind it or the browser conversation's cause.
Do not call this a capacity error or approve unrelated actions automatically.
The next investigation is the provider's approval semantics and how the app reports blocked specialist work.
No new research create was submitted to work around the wait.
Procurement recommendations are recorded separately in procurement-path.md and are not an accepted product-scope change.
