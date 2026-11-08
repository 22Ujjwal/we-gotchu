# Local agent-led planning handoff

Status: code integrated locally; live research and browser acceptance not passed.
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

The retained research agent is agt_95n3aqvyk5qhpd4k9z5pc7bnxt, configuration version 2.
Its definition is src/agent/planning/definition.ts.
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

The last attempt is unresolved.
A read-only session listing for the configured agent also timed out.
Do not claim no session exists, and do not start another test until inspecting sessions for metadata.conversationId=7682e2c6-f441-4152-82fd-326ad53e661e.
The create idempotency key is planning:7682e2c6-f441-4152-82fd-326ad53e661e:7682e2c6-f441-4152-82fd-326ad53e661e:start.
Do not silently replay that write with a different request body or key.
No full live research turn, live follow-up, or background completion claim is made.

## Verification

The integrated code passed these commands using Bun1.4.4:

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
The browser has not been used to verify this new flow.
The final desktop run should create a real conversation, receive useful options, select a venue, ask for cheaper supplies, reload, and verify the selected venue and same conversation remain.
It should separately check return after closing the page during hosted research.
Do not treat controlled tests as proof of these live outcomes.

## Follow-up team

Tony proposed a named product team inside Naive.
The suggested roles are Tom as event lead, Maya for venues, and Sam for supplies.
Only the reusable researcher is configured now.
Handoffs between named specialists are a later change after a complete live conversation succeeds.
The coding sessions for API/storage and UI finished their assigned local stages and were integrated here.
