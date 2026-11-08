# Company service tools

The customer flow now starts research from the homepage, keeps the loading animation visible, and renders saved venue cards with follow-up chat.
The next integration lets the hosted planner call existing application services.
It does not move payment, email credentials, or customer ownership checks into the model.

## Verified custom tool call

On November 8, 2026, a separate controlled hosted session called a local MCP server through a temporary HTTPS tunnel.
The server exposed only `arrange.get_demo_status`, a read-only tool with no customer data or external actions.
The agent configuration explicitly allowed that tool and denied other tools.
The server generated a random challenge that was not present in the agent prompt.
The hosted agent returned the exact challenge obtained through the tool.

- Agent ID: `agt_vnts8k7gdvty81g9crgtkz2r2f`.
- Session ID: `ses_wkw43zmw4zd9y9kjsn0q9jvmre`.
- Server observed `initialize`, `notifications/initialized`, `tools/list`, and one `tools/call`.
- Provider recorded `tool.started` at 15:56:43.261 UTC and successful `tool.completed` at 15:56:43.323 UTC.
- Session reached `idle` with `end_turn` at 15:56:46.122 UTC.
- The captured event page contained no approval request.
- Provider usage reported one tool call and 3,843 micro USD.

The local evidence is in `.scratch/verification/company-tools/`.
Those files are not published with the repository.
This proves hosted invocation of a custom read-only tool, not authenticated access to a customer record, mail sending, or the full business journey.

The installed SDK version is `@usenaive-sdk/managed-agents` 0.12.3.
Its agent configuration accepts named MCP server URLs and optional headers.
Its session creation type does not expose a per-session MCP override.
The official [tool documentation](https://usenaive.ai/blogs/naive-inside-your-agent-framework) describes per-tool allow, ask, and deny policies.

## Implementation boundary

Use one small MCP adapter over the existing planning services.
Do not create a second email or payment implementation.
Start with reading the current event and saving a prepared inquiry for the selected venue.
Bind access to one conversation with server-verified authorization rather than accepting a model-supplied customer ID.
Do not return access credentials in the customer view or tool results.

A tool that prepares an inquiry may not approve or send it.
The current `send_inquiry` customer command records approval and sends in one operation, so exposing that command directly to the model would let the model authorize itself.
Separate those responsibilities before exposing an approved-send operation.
Preserve the existing stable request ID and uncertain-send handling.

The first live acceptance check must show the hosted planner reading the selected event and saving a useful inquiry without browser automation performing those internal steps.
Then the customer approves the exact recipient and content once.
A received reply should continue through the existing background interpretation and offer preparation.
Payment still requires a complete current offer and customer approval in the existing sandbox transaction path.
