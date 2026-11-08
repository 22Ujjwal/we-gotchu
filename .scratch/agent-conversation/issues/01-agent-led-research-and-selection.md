# Connect agent-led research to customer chat and selection

Type: implementation.
Status: not started.
Owner: Tony.
Spec: [Agent-led event planning](../../specs/agent-led-event-planning.md).
Capability proof: tools/agent-research-proof.

## Prerequisite

Configure the Monid MCP credential in Naive using an administrator-capable setup credential.
The application should reference the configured agent rather than require admin access on every event.
Rerun the direct MCP proof and record tool calls and both conversation turns.
If this path fails, inspect the provider error before introducing a custom adapter.

## Implementation sequence

1. Configure a reusable Naive research agent and use the official SDK in a small server module.
Use Monid's existing hosted MCP endpoint.
2. Add the minimal event conversation persistence and message API.
Continue the same hosted session for customer changes and save proposals and selections in Neon.
3. Connect chat, proposal cards, and selection using the existing frontend design.
Keep existing auth and defer checkout.
4. Prove the complete local path, then remove the old research-stage loop from the production path.
Delete obsolete parsing and orchestration code only after replacement coverage passes.

Each stage gets a focused test and commit.
Coordinate shared schema and migration changes with the backend owner before integration.
Do not edit teammate status files.
Do not push until Tony ends the local-only hold.

## Tests that matter

Use recorded real provider evidence for venue rates, capacity, product prices, and mixed pack contents.
Test source attribution, unknown availability, follow-up selection preservation, duplicate message delivery, and reconnect without creating another session.
The desktop acceptance run starts with chat, produces useful options, selects one, asks for a cheaper plan, and reloads.
Terra performs browser verification after the implementation handoff.
No automated fixture result counts as live provider or browser proof.

## Finish condition

Tony can use chat to research and select real event options locally.
The proposal is useful before booking confirmation and explains remaining unknowns without diagnostic clutter.
Report exact head, commands, provider evidence, and remaining setup.
Keep everything local until authorized to push.
