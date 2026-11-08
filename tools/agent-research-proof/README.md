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
The current application key cannot create that vault because it lacks admin scope.
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
