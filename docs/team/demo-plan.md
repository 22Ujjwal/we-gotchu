# Demo plan

Status: proposed critical path for the hackathon build, not a record of completed work.
Hacking stops at 11:00 AM on November 8, 2026, and final presentations start at 1:00 PM.
Use the [contract draft](../contracts-draft.md) 0.3 and the [demo acceptance checklist](../demo-acceptance.md).
Times are Pacific and are targets; if a milestone misses its time by more than an hour, switch that milestone to its fallback and move on.

## What the demo must show

Judges focus on how much of the company runs without the team.
The demo shows three things on one event page:

1. The agent doing the work: researching venues and supplies, choosing a plan, executing the bookings, and canceling them.
2. What the agent decided and why, from the `reason` it stores with each tool call and its plan reasoning.
3. Where a person stepped in: exactly two customer steps, approve-and-pay and cancel, marked as human in the progress log.

The page shows `live`, `test`, or `simulated` next to every payment and action.

## Most likely honest demo

This is the expected outcome given current evidence, and anything more live is a bonus.

| Step | Expected mode | Why |
| --- | --- | --- |
| Research with real web sources | live | `web_search` and a required `submit_output` ran in this account in Tony's readiness report (branch research/agent-readiness, one synthetic brief); the first turn needed a corrective message. |
| Agent calls our guarded MCP endpoint | live | Documented by Naive; unverified in our account. |
| Customer payment and refund | test | Stripe test mode exercises the real Checkout, webhook, and refund APIs without real money. |
| Venue booking and item purchase | simulated | No supplier is selected, Naive cards are unavailable, the browser guard refuses credential-shaped typing, and no secure card entry is documented, so unattended live supplier checkout is not expected by 11:00 AM. |
| Venue and item cancellation | simulated | Follows the simulated bookings. |

A live supplier booking is a stretch goal for Tony only after milestone 6 passes.

## Critical path

| # | Target | Milestone | Owner | Done when | Fallback |
| --- | --- | --- | --- | --- | --- |
| 1 | Nov 7, 7:00 PM | Public HTTPS deploy of the current app with a stub POST /api/mcp that answers `initialize`, `tools/list`, and a `ping` tool behind the bearer check. | Ujjwal | A curl JSON-RPC `tools/list` against the public URL returns `ping`, and a call without the bearer gets 401. | A stable tunnel to a laptop (a reserved ngrok domain or a named Cloudflare tunnel); never a random tunnel URL, because Naive's vault credential is matched to the exact URL. |
| 2 | Nov 7, 8:00 PM | Naive hello for execution: an agent definition with our MCP server, its static bearer stored in the vault, and one session that calls `ping`. Research does not wait on this. | Tony | Our server log shows an authenticated `ping` from a Naive session, and the session id is pasted in Tony's status file. | A labeled scripted agent: a Bun script that calls the same MCP tools in order with canned reasons, shown as simulated agent. Research still runs on Tony's tested path. |
| 3 | Nov 7, 9:00 PM | Contract 0.4 schemas and three fixtures merged in src/contracts. | Ujjwal, reviewed by Tony and Leo | `bun run typecheck` and `bun run test` pass on main, and Leo renders the plan-ready fixture. | Leo and Tony work from the fixture JSON on the branch before merge. |
| 4 | Nov 7, 11:00 PM | Neon tables, POST /api/events, GET /api/events/:id, and MCP tools `get_event` and `log_progress`. | Ujjwal | POST /api/events starts a research session through Tony's `startResearch`, and the validated plan from `advanceResearch` appears in GET /api/events/:id. | Seed the plan from the fixture with a "simulated research" label. |
| 4a | Nov 7, 11:00 PM | Research session and validator that turn the brief into candidates and a plan through `submit_output`, with reasons, evidence fields, and budget fit. | Tony | Two different briefs produce different plans with source URLs. | Agent picks from a small seeded candidate list instead of open web search, labeled. |
| 5 | Nov 8, 1:00 AM | POST /api/events/:id/approve creates the Approval and a Stripe test Checkout session; the webhook marks it paid and starts the execution session. | Ujjwal | Paying with a Stripe test card moves the event to `executing` without touching the success URL; a second webhook delivery changes nothing. | A "Simulate payment" button, shown only when the server's simulation switch is on, that records a Payment with mode `simulated`. |
| 5a | Nov 8, 1:00 AM | Simulated supplier adapter and execution prompt that calls `execute_action` for the venue, then the item. | Tony | Both attempts reach `succeeded` with `sim_` references, and calling `execute_action` twice returns `replayed: true`. | None needed; the simulated adapter is already the fallback. |
| 6 | Nov 8, 3:00 AM | Event page on the real API: intake with a "Use demo brief" button, plan with reasons, approve-and-pay, progress log, and status badges. | Leo | A teammate completes intake through `booked` on the deployed URL without help. | The same page driven by fixtures, labeled simulated. |
| 7 | Nov 8, 8:30 AM | Cancel: POST /api/events/:id/cancel, the cancellation session calling `cancel_action` twice, and the Stripe test refund. | Ujjwal and Tony | The event reaches `canceled` and the refund shows Stripe's reported state. | Cancel runs the backend cancellation directly without an agent session, labeled. |
| 8 | Nov 8, 9:30 AM | Full rehearsal on the deployed URL, a recorded fallback video of one complete run, and a seeded completed event. | Ferdinand, with all | Two clean runs in a row and the video saved locally. | Present the recorded run with its label. |
| 9 | Nov 8, 10:30 AM | Code freeze. | Ujjwal | Main is deployed and the rehearsal run still passes. | Roll back to the last deploy that passed rehearsal. |

Sleep in shifts after milestone 6 so that someone who knows each area is awake at 7:00 AM.
Milestones 1 and 2 are the riskiest and come first; if either fails at its target, use its fallback rather than debugging past 9:00 PM.

## Who starts each Naive session

Tony owns src/agent and exports functions the backend calls: `startResearch(event)`, `advanceResearch(event)`, and, if he agrees, `startExecution(event, approval)` and `startCancellation(event)`.
Each creates one Naive session with `client.sessions.create({ agent_id, message })`, passing the eventId in the message and an idempotency key such as `approvalId:execute`.
One session per phase avoids depending on resuming an idle session.
Tony also owns a one-time setup script that creates the agent definition and records its id in an environment variable, NAIVE_AGENT_ID.
MCP purchase tools are configured with `permission: "allow"`; the backend is the approval check.

## Testing the MCP endpoint without Naive

Test the endpoint with curl JSON-RPC requests or the MCP Inspector before pointing Naive at it.
Naive's own `/v1/mcp` speaks only `initialize`, `tools/list`, and `tools/call`; whether Naive's client also needs streaming responses from our endpoint is unverified and is checked in milestone 2.
Test the Stripe webhook locally with `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Demo-day fallbacks

Keep these ready before the freeze, in order of preference.

1. Live run on the deployed URL with simulated suppliers and Stripe test mode.
2. The same run with the scripted agent if Naive is unavailable, labeled simulated agent.
3. The recorded video of a complete run, labeled recorded.

The fallback switches are environment variables owned by Ujjwal and must be visible in the UI when on.

## Demo brief

Ferdinand and Tony agree one realistic demo brief by milestone 4, including city, date at least two days out, headcount, budget, one supply item, and an acceptable cancellation loss.
Use the friend's event only if its real details are confirmed.
