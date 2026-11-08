# Remaining stages and parallel ownership

Tony approved splitting stage three between planning work and supplier-mail transport.
This replaces the previous assignment of all stage-three work to Tony.
The split changes ownership, not the customer outcome or the three existing tickets.

## The five product stages

1. Deliver a useful sourced proposal with one planner.
2. Preserve selected options through follow-ups, reload, and returning visits.
3. Draft an inquiry, send the approved message, and turn a supplier reply into an offer on the same conversation.
4. Connect the selected offer to approval and sandbox payment using the existing transaction backend.
5. Integrate, deploy, and rehearse the exact demo revision.

These are the five stages from Tony's saved roadmap.
Stage three contains three implementation tickets; they are not additional product stages.
The latest reported local browser run passed stage-two comparison and persistence, but shipping and review remain separate gates.
Stages four and five remain roadmap work, not newly published implementation tickets.

## Work that can start in parallel

Tony owns the planner's inquiry draft, editable customer approval, conversation persistence, reply interpretation, and customer UI.
Reserved areas are `src/agent/planning/**`, `src/server/planning/**`, planning API routes, and planning components and clients.
Tony owns the shared inquiry contract and generated route-tree updates.

Ujjwal owns supplier-mail sending, inbound receipt, provider message and thread references, delivery reconciliation, and duplicate inbound handling.
Use a new isolated module under `src/server/email/supplier-inquiries/**`.
Agree on any new webhook route filename before creating it.
Reuse the installed email integration if its actual capabilities meet the requirements.
Do not change the existing customer quote-ready email flow.
Do not edit planning prompts, conversation services, planning UI, or the shared contract independently.

The draft and transport can be implemented concurrently after agreeing on the small interface below.
Integration still follows draft, send, then reply interpretation.
Coordinate schema, migrations, runtime wiring, and root dependency edits before either owner changes those files.
Tony makes shared planning changes; Ujjwal reports required additions rather than modifying them independently.

## Interface to agree before implementation

The send operation receives a request ID, conversation ID, inquiry ID, approved draft revision, recipient, subject, and message text.
Tony's service verifies that the customer approved those exact values before invoking transport.
The transport returns provider message and thread references and an evidenced status.
Provider acceptance must not be labeled delivery.
The same request must not silently send a second message after a timeout or repeat click.

Inbound handling supplies the provider event ID, message ID, thread ID or reply reference, sender, recipient, subject, text, received time, and original-message reference.
Ujjwal verifies the inbound source and deduplicates delivery.
Tony associates it with the conversation, interprets it, and saves the customer-facing offer.
Reply receipt must not depend on the customer leaving the page open.
Confirm exact SDK semantics before freezing the TypeScript interface; these fields describe the required boundary, not an assertion about provider support.

## What each owner must verify

Ujjwal first verifies transport using an explicitly approved team-controlled inbox.
Send once, inspect the received message, reply, and verify the incoming provider references correlate with the original inquiry.
Verify duplicate inbound delivery, failed delivery, and an uncertain send without blind resend.
Confirm inbound processing works without an open customer tab.
Record exact commit, configuration names without secrets, provider references, checks, and unresolved limitations.
A controlled reply is test evidence, not a real supplier quote.

Tony verifies draft generation from the saved selection, editing, exact-message approval, stale-draft handling, reply interpretation, and retained selections.
Missing prices and terms stay unknown.
A question, refusal, tentative availability, quote, and reservation confirmation must remain distinct.

After both handoffs, run the combined local browser journey in the separate Terra testing session when requested.
Select venue, prepare draft, approve the controlled recipient, send once, close the page, reply from the controlled inbox, reopen, and inspect the offer and original message reference.
Reload must retain the same inquiry and offer.
Run existing shipping checks on the combined revision; add focused regression coverage for reproduced failures.
Real supplier outreach requires separate explicit recipient and message authorization.

## Ujjwal's next work after mail transport

Prepare stage four by inspecting the existing transaction backend and documenting the exact offer fields needed for a versioned plan.
Use a clearly simulated offer to verify the existing sandbox payment and webhook path independently of unfinished inquiry work.
Do not create a second transaction model or wire speculative planning commands.
Tony owns the eventual selected-offer bridge and approval UI; Ujjwal owns transaction and payment internals.
Freeze that interface together before implementation.

Stage-four acceptance checks must compare selected venue, supplies, quantities, currency, offer revision, and amount through approval, Checkout, webhook processing, and reload.
A changed offer requires new approval.
Customer payment and supplier booking confirmation remain separate statuses.

Ujjwal can also prepare stage-five hosted configuration and migration readiness.
Coordinate the deployed revision and migration window before production changes.
Final acceptance must use actual sign-in and the complete customer path on that exact deployment.

## Tony's useful parallel contribution

Choose the controlled test inbox and review one realistic supplier reply for the acceptance run.
Decide whether the draft reads like an event-planning company and whether the resulting offer answers the customer's practical questions.
Choose the final demo story and which real supplier, if any, may receive an explicitly approved inquiry.
No credentials should be placed in the handoff or chat.

## Deferred work

Venue images remain a separate assignment if already underway; confirm Ujjwal's active work before switching him to mail transport.
Live activity paper slips, research-result caching, and general UI refinement do not block stage three.
No new sessions, outreach, deployment, or provider configuration changes are authorized by this document alone.
