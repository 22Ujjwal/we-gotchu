# Managed event research proof

This is an isolated experiment, not the production research engine.
It uses the published Naive SDK and Monid's existing MCP server.
The application dependencies, UI, database, and provider configuration remain unchanged.

## Run

From the repository root, install the isolated package and check the proof's call boundary:

```sh
npm ci --prefix tools/agent-research-proof --ignore-scripts
node --test tools/agent-research-proof/proposal.test.mjs
```

Read existing real Monid results and test interpretation plus a same-session follow-up:

```sh
PROOF_MODE=saved RESEARCH_LIVE_SMOKE=1 bun --env-file=.env.local tools/agent-research-proof/proof.mjs
```

Test direct agent-selected Monid calls after vault setup permissions are available:

```sh
RESEARCH_LIVE_SMOKE=1 bun --env-file=.env.local tools/agent-research-proof/proof.mjs
```

Run these commands through agent-process with a 660-second deadline when using an agent session.
Both modes make paid Naive calls.
Saved mode reads the three recorded Monid run IDs in proof.mjs; it does not perform fresh searches or prove autonomous tool choice.
The environment must contain NAIVE_API_KEY, NAIVE_MODEL, and MONID_API_KEY.
Keep credentials out of prompts, command arguments, and tracked files.

## Behavior

The proof creates a temporary agent and a conversation, retrieves a proposal, sends a selection and cheaper-plan request, and reads the second proposal from the same session.
Direct mode provisions a temporary agent-bound credential in a temporary Naive vault.
The original key could not create that vault because it lacked admin scope.
The updated local key successfully created a vault and credential in the connection test below.
This is one-time setup work for production, not a reason to grant admin access to every customer request.
The script cancels its session and removes only its own agent and vault on normal completion or a caught failure.
A hard process kill can bypass cleanup; use the IDs saved in the output record to inspect only those resources.

Results go into ignored output/<proof-id>/result.json.
The record includes resource IDs, classified failures, proposals, reported spend, and cleanup outcomes, but no credentials.
The success flag proves the selection starts empty and persists through a same-session follow-up.
It does not certify factual accuracy, UI integration, autonomous Monid use in saved mode, or a complete event budget.
Read the proposal before calling the experiment successful for the product.

The proof uses a USD0.50 Naive session cap and at most eight approved Monid runs with maxCost at most USD0.05 each.
Monid charges separately, and its maxCost is an estimate ceiling rather than a guaranteed final bill for metered endpoints.
These are experiment limits, not proposed production coverage limits.
Choose production budgets from measured proposal quality and latency.

## Production direction

Use a reusable configured research agent, its hosted sessions and events, and a small persistence layer.
Do not copy this temporary provisioning and cleanup script into each customer request.
Keep customer selections authoritative in application storage; an agent recommendation is not a customer selection.
See the focused spec and ticket under .scratch/specs/agent-led-event-planning.md and .scratch/agent-conversation/issues.

## Direct connection verified

The local connection test completed on 2026-11-08 UTC using connect.mjs.
Naive called monid.monid_inspect for channel3 /v1/search and received its actual input specification.
The session returned that specification through submit_output with no pending approvals.
This verifies authenticated direct tool use, not a supplier search or the complete application journey.
Reported Naive consumption was 2445 micro-USD.
The test session was stopped, while the agent and credential remain available for reuse.
No production deployment or application contracts changed.

Non-secret resource IDs:

- Agent: agt_95n3aqvyk5qhpd4k9z5pc7bnxt
- Vault: vlt_gan30nrft94yqfgr5qkxqar8hm
- Credential: vcr_wr4ang1h8q72ftrsr57p96d7z4
- Stopped test session: ses_r4fgqb4jm7ap524vfa1915p2y4

The retained agent was subsequently updated to version 2 using configure.ts and src/agent/planning/definition.ts.
That single-agent configuration was subsequently replaced by the named team at lead version 3.
Tom delegates to Maya and Sam, which have Monid discover, inspect, run and get-run access.
It is separate from execution and cancellation workflows.
A completed live supplier research turn has not yet been verified because subsequent session requests hit capacity errors and a timeout.
The ignored evidence record is output/connection-3f382d84-e7b7-4cab-a2d1-1c49143be8c7/result.json.
Do not rerun connect.mjs casually: a fresh invocation creates resources, and it deliberately refuses to resume a record that already has a session.

## Local application handoff

The local application now uses src/agent/planning/provider.ts for new planning conversations.
See docs/research/agent-led-planning-local.md for setup, verification and the unresolved session-create attempt.
The planning.ts proof performs paid hosted research and a selection follow-up, with no purchases or supplier contact.
The uncertain attempt was checked with a complete read-only listing, which found no matching session.
Consult the handoff before another paid test.
A new invocation creates a new conversation and is not a retry of an earlier attempt.
