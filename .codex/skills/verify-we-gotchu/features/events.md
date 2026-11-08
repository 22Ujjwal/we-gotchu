# Existing event screens

## Sub-features

The existing structured brief, venue screens, event state and receipts remain separate from planning conversations.

## How to get to it (user POV)

The homepage structured form uses the existing event API.
Saved events use /events/$eventId; receipts use /events/$eventId/receipts.

## Driving it with the shared browser

For a planning-only merge, confirm the homepage's structured form and date picker still render without submitting an additional event.
Use an existing authorized event URL for read-only inspection if provided.
Do not infer that a planning selection creates an event transaction plan.

## Gotchas

Approval can start Checkout and the existing email flow.
Do not click it during a research-only check.
Development preview fixtures are not evidence of live research, payment or supplier execution.
