# Agent-workflow handoff

Assigned teammate: Tony.
Tony owns agent workflow under the shared ownership contract.

You own research, recommendation generation, the Naive runtime integration, and supplier interaction adapters.
Read the [research index](../research-index.md), [architecture](../architecture-draft.md), and [contracts](../contracts-draft.md).

## Hackathon deliverables, in order

Follow the [demo plan](demo-plan.md); these come before everything else in this brief.

1. Research first, using the path you already tested: `startResearch(event)` creates a session with `web_search` and a required `submit_output`, and `advanceResearch(event)` reads it by sequence, validates it, and returns the result the backend stores as the Plan.
   The backend calls both; there is no worker.
   Your research spec stays the source for the ResearchResult schema, which you and Ujjwal reconcile with the contract's Plan and Candidate fields.
2. By milestone 2, a setup script that adds our MCP server to the agent used for execution and cancellation, stores the static bearer in Naive's vault for the exact deployed MCP URL, and a hello session that calls our `ping` tool, with its session id in your status file.
   Research does not wait on this step.
3. Proposed, needs your agreement: `startExecution(event, approval)`, `startCancellation(event)`, and the prompts that call `execute_action`, `cancel_action`, and `log_progress` with a reason each time.
4. Proposed, needs your agreement: the simulated supplier adapter in src/suppliers implementing the contract's SupplierAdapter interface.
   If you would rather keep to the research-only scope, Ujjwal writes this adapter and the execution prompts.
5. If Naive is unavailable, the labeled scripted-agent fallback described in the demo plan.

Everything below is the longer-term brief; live supplier checkout is a stretch goal after milestone 6.

## Deliverables

Verify the account's hosted pi capabilities with the managed-agents SDK before relying on approval or streaming behavior.
Use Naive credits for the proposed runtime.
Keep OpenAI direct calls optional and separate from Naive billing.
Turn the event brief into evidence-backed venue and supply candidates.
Return structured plans through the shared contract instead of treating prose as executable instructions.

Discover Monid tools that actually support the needed research and inspect their requirements before using them.
Use AgentMail only when approved supplier communication is part of the selected workflow.
Implement supplier commit, cancel, and reconcile methods behind the shared adapter contract; quote and recovery are deferred.
Keep live and simulated adapters explicit.
Support progress streaming and resume without declaring an approval pause to be completion.

## Dependencies and boundaries

Use the transaction owner's guarded MCP tools for mutating actions.
Purchase tools are set to `allow` on the Naive side; our MCP endpoint matches each call to the stored approval and is the only approval check for the hackathon.
Naive's call-scoped `ask` confirmation is deferred until real money is used.
Do not treat broad browser write access as customer purchase permission.
Do not build on Naive cards or wallet while the documented capabilities are unavailable.
Verify supplier login, secure payment entry, authentication challenges, and receipt extraction before claiming unattended checkout.
Never put raw card data in prompts or logs.

Work with the transaction owner to select suppliers whose actual cancellation terms fit the brief.
A low item price is insufficient if cancellation is only a request or refund is store credit.
If a timeout leaves the outcome unknown, reconcile supplier history before a new attempt.

## Acceptance

A changed brief changes the candidates or recommendation in an explainable way.
An unapproved commitment or outreach attempt cannot reach the supplier mutation.
Each successful booking, order, and cancellation returns supplier evidence.
A simulated action remains labeled through every adapter output.
A resumed runtime does not independently repeat a purchase.
Report which supplier integrations were exercised live and which remain simulated or unverified.

## Copyable agent assignment

Implement the agent and supplier-adapter role in the owned src/agent and src/suppliers directories after contract agreement.
Consume the transaction service for permission checks and execution identity.
Keep provider-specific behavior behind the shared interfaces and return evidence for every claimed external outcome.
Do not modify payment, database, root configuration, or frontend files without the owning developer's coordination.
