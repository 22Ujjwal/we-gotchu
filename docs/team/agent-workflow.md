# Agent-workflow handoff

Assigned teammate: Tony.
Tony owns agent workflow under the shared ownership contract.

You own research, recommendation generation, the Naive runtime integration, and supplier interaction adapters.
Read the [research index](../research-index.md), [architecture](../architecture-draft.md), and [contracts](../contracts-draft.md).

## Deliverables

Verify the account's hosted pi capabilities with the managed-agents SDK before relying on approval or streaming behavior.
Use Naive credits for the proposed runtime.
Keep OpenAI direct calls optional and separate from Naive billing.
Turn the event brief into evidence-backed venue and supply candidates.
Return structured plans through the shared contract instead of treating prose as executable instructions.

Discover Monid tools that actually support the needed research and inspect their requirements before using them.
Use AgentMail only when approved supplier communication is part of the selected workflow.
Implement supplier quote, execute, reconcile, cancel, and recovery methods behind the shared adapter contract.
Keep live and simulated adapters explicit.
Support progress streaming and resume without declaring an approval pause to be completion.

## Dependencies and boundaries

Use the transaction owner's guarded MCP tools for mutating actions.
Match each call to a stored action approval and use call-scoped runtime confirmation.
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
