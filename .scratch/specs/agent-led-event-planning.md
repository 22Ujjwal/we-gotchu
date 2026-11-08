# Agent-led event planning

Status: implemented locally; live research and desktop acceptance remain unverified.
Owner: Tony.
Scope: customer chat, research, information, and selection.

## Outcome

A customer describes an event, receives useful venue and supply options, selects one, and asks for changes in the same conversation.
The customer can reload and return to the same work.
A useful proposal can contain published rates and estimates without claiming a confirmed booking.

## Approach

Use one reusable Naive agent configuration and one Naive session per event conversation.
Connect that agent directly to Monid's hosted MCP server.
Let the agent choose searches, retrieve details, interpret supplier language, and explain trade-offs.
Use the Naive SDK for session creation, follow-up messages, structured output, and event streaming.
Keep Clerk as existing authentication and Neon as the application's saved conversation and selection state.
Defer Stripe, supplier contact, and booking.

This deliberately replaces the earlier ranking-only agent and fixed application-driven research stages.
Do not build a new queue, custom scraping framework, or general workflow engine for this slice.
Tony has proposed a named product team after this slice works: an event lead, venue researcher and supplies researcher.
Their handoffs are not implemented by the current single-agent flow.
Do not make our hosted event MCP endpoint a prerequisite for research when Monid already exposes the required tools.

## Customer flow

1. The customer enters a natural-language brief using the existing visual style.
The agent asks a short follow-up only if the answer materially affects research.
2. Naive researches with Monid and produces a short proposal.
Progress comes from its actual session events, translated into brief customer-facing messages.
3. Cards show the option, source link, relevant published facts, estimated costs when supported, and specific remaining questions.
Published product prices remain visible even when pack counts or event totals are unknown.
4. Selecting an option saves its stable ID and sends the selection to the same session.
A request such as "keep this venue, but reduce the supply cost" retains the selected option and revises the proposal.
5. Reload reads the saved session identity, latest proposal, messages, and selections.
It never starts a second research session merely because the customer returns.

## Small data boundary

The proof uses a structured proposal with summary, options, selectedOptionId, and nextQuestion.
For production, remove the agent-owned selectedOptionId field; store the customer selection separately and pass it into the next turn.
Each option has a stable ID, kind, name, URL, explanation, attributed facts, and specific unknowns.
Facts distinguish published information from calculated estimates and event-date confirmation.
The production shape should add only fields required to render and persist this flow.
A research proposal is separate from the existing transaction Plan and never needs to manufacture payment actions.
Persist session ID, last sequence, proposal version, message IDs, and selected IDs with the event.
Customer selections are authoritative in application storage; the agent cannot mark an option selected before the customer chooses it.
Reuse existing storage patterns; add the smallest migration needed rather than duplicating provider transcripts.

## Division of work

Naive owns research choices, language interpretation, follow-up questions, and explanations.
Monid supplies retrieved information through its existing MCP tools.
Application code owns customer/event identity, message delivery, persistence, selection, and rendering.
Use code for arithmetic when presenting calculated totals, not for interpreting every possible supplier sentence.
Do not let prose overwrite a calculated remaining budget or present a complete total when components are missing.
Prefer the SDK's event stream and session continuation over another custom research state machine.
A hosted session can work while the tab is closed; application persistence must reconcile its result on return.
Test that behavior before claiming background completion.

## What to retire

After the new flow passes acceptance, remove the production dependency on the discovery/investigation/ranking phase loop in src/agent/integration.ts.
Remove the ranking-only system prompt and manual correction turn used only by that loop.
Remove keyword-based venue interpretation and exact-sentence pack extraction from the new production path.
Keep source records or utilities that still have a concrete caller.
Do not keep two research engines indefinitely or delete recovery code still used by the old path before the replacement is proven.

## Acceptance

- The agent performs a Monid tool call from its hosted session and returns source-backed venue and supply options.
- Published prices remain useful information even when final totals or availability are unknown.
- A supplier page with rates and capacity yields those published facts; a customer review does not become a venue policy.
- A mixed party set is described by its actual contents rather than treating every piece as a plate.
- Selection and a cheaper-plan follow-up use the same session and retain the selected option.
- Reload restores the conversation and selection without another create call.
- Closing the browser during research and returning restores the hosted outcome, subject to explicitly reported provider limits.
- Missing information is explained per option; raw tool names and repeated diagnostic paragraphs are not the customer experience.
- Existing application checks pass, and Terra verifies the actual desktop flow on the final local head.

## Capability gate

Monid's hosted MCP catalog accepts the existing Monid key.
Naive's SDK documents hosted MCP, structured proposals, same-session messages, and resumable event streaming.
The updated Naive key successfully created the vault and agent-bound Monid credential.
A hosted session completed monid_inspect through that connection.
The reusable research configuration is now version 2, but live research attempts are blocked by provider capacity and a timed-out create.
Saved-evidence extraction alone does not satisfy that acceptance criterion.

## Limits

Keep the current USD0.50 Naive session cap during the proof.
Production budgets should follow measured proposal quality and latency, not an arbitrary goal to minimize spend.
Tony reports USD250 of Naive credit available.
Monid charges separately; inspect its prices and record actual calls.
Do not raise budgets silently if a proof cannot finish.
No push, merge, deployment, payment, supplier contact, or browser test is part of this planning pass.
