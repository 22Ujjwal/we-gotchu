# 03: Turn a supplier reply into an updated offer

**What to build:** A supplier reply updates the same event with its quoted price, availability, terms, and remaining questions so the customer can decide the next step.

**Blocked by:** 02: Send and track the approved inquiry.
External prerequisite: verified inbound email access and a supported way to correlate replies with the outgoing inquiry.

**Status:** ready-for-agent

- [ ] Receive a reply through the chosen email integration and associate it with the correct inquiry and planning conversation using provider message or thread identity.
- [ ] Preserve the original reply and show a customer-readable summary with links or references to its source message.
- [ ] Extract the quoted venue, date and time, capacity, currency, cost components, deposits, cancellation terms, and offer expiry when present; leave omitted facts unknown.
- [ ] Distinguish a supplier question, tentative availability, a quote, a refusal, and a confirmed reservation rather than treating every reply as an offer.
- [ ] Keep the selected venue and unrelated supply choices intact while presenting updated facts and unresolved questions.
- [ ] A duplicate inbound delivery does not duplicate the message or offer, and an older reply does not silently replace a newer offer.
- [ ] Process the reply without requiring an open customer tab through the supported inbound mechanism; verify that returning to the event shows the saved update.
- [ ] Verify an authorized controlled-inbox reply through receipt, interpretation, browser display, and reload, clearly labeled as test evidence.
- [ ] If a real supplier reply is available from separately authorized outreach, verify it through the same path and report that evidence separately.

## Verification and boundaries

Use real-run-first verification and existing checks.
No payment or transaction-plan bridge is part of this ticket.
A quote or tentative availability is not a supplier commitment.
Do not silently change customer selections, accept terms, send another message, or initiate a purchase based on the reply.
Keep UI presentation refinements separate from the minimum clear offer and source display.

## Coordination

Tony owns the shared inquiry contract, planning state, customer approval and UI, and reply interpretation.
Ujjwal owns the isolated supplier-mail transport, inbound handling, provider references, and transport deduplication.
Agree on the send and inbound interfaces before implementing in parallel.
Coordinate shared schema, migration, runtime, and dependency changes before editing.
See [the ownership and verification handoff](../../../docs/research/stage-three-team-handoff.md).
