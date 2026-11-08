# 02: Send and track the approved inquiry

**What to build:** The customer approves the current inquiry once, and the company sends it and shows its actual delivery status on the same saved conversation.

**Blocked by:** 01: Prepare an inquiry for the selected venue.
External prerequisite: a verified sending inbox and an agreed email integration owned in coordination with Ujjwal.

**Status:** ready-for-agent

- [ ] Verify sending capability and provider receipt semantics before enabling the send action.
- [ ] The customer approves the exact recipient and current draft; approval authorizes an inquiry, not a booking or purchase.
- [ ] Send the approved draft once and save the provider's message and thread references with the conversation.
- [ ] Show queued, sent, delivered, failed, or uncertain states only when supported by the provider's available evidence; do not equate acceptance with delivery or a supplier response.
- [ ] Repeated clicks and page reloads do not create duplicate inquiries.
- [ ] A timeout or lost response preserves the draft and pending operation, and checks existing provider evidence before any repeat send.
- [ ] Editing the approved draft or changing the selected venue requires approval of the new message before sending.
- [ ] Verify the browser-to-email journey against a controlled recipient explicitly approved for testing, and inspect the received message and provider reference.
- [ ] Reload restores the same inquiry status and references.

## Verification and boundaries

Use real-run-first verification and existing checks.
Keep controlled-recipient evidence labeled as a test; it does not prove a supplier received or accepted an inquiry.
Ticket publication is not authorization to email a real supplier.
A real-supplier proof requires Tony's explicit recipient and message authorization.
No payment, reservation, purchase, bulk outreach, or automatic follow-up sequence belongs in this ticket.

## Coordination

Tony owns this complete stage-three slice, including mail integration, planning state, and customer UI.
Ujjwal's parallel assignment is venue images and hosted readiness, not supplier inquiries.
Coordinate shared schema, migration, runtime, and dependency changes before editing.
