# 02: Send and track the approved inquiry

**What to build:** The customer approves the current inquiry once, and the company sends it and shows its actual delivery status on the same saved conversation.

**Blocked by:** 01: Prepare an inquiry for the selected venue.
External prerequisite: a verified sending inbox and an agreed email integration owned in coordination with Ujjwal.

**Status:** application boundary implemented locally; real transport integration and browser verification pending

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

Tony owns the shared inquiry contract, planning state, customer approval and UI, and reply interpretation.
Ujjwal owns the isolated supplier-mail transport, inbound handling, provider references, and transport deduplication.
Agree on the send and inbound interfaces before implementing in parallel.
Coordinate shared schema, migration, runtime, and dependency changes before editing.
See [the ownership and verification handoff](../../../docs/research/stage-three-team-handoff.md).

## Application-side checkpoint

The local `feat/planning-inquiry-drafts` branch adds exact-draft approval, persisted send intent and accepted, failed or uncertain results.
`src/server/planning/supplier-mail.ts` defines the actual exported transport boundary.
`PlanningDeps.mail` is optional and not wired into the runtime until Ujjwal's adapter is verified.
Controlled tests cover exact payloads, duplicate requests, uncertain sends, rejected-message replacement and reloaded pending-status reads.
The customer UI only enables approval when the backend advertises the transport capability.

No live send, delivery, browser approval or provider reconciliation has been verified in this checkpoint.
Ujjwal's transport handoff is the prerequisite for the controlled-inbox integration run.
