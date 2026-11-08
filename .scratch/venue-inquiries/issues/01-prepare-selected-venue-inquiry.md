# 01: Prepare an inquiry for the selected venue

**What to build:** A customer can turn their saved venue selection into a clear inquiry draft asking about event-date availability, the full price, and cancellation terms.
The draft is attached to the same planning conversation and survives reload.

**Blocked by:** Stage two: Keep customer choices through changes and return visits, including resolution of its outstanding review findings.

**Status:** ready-for-agent

- [ ] Start from an actual saved proposal and selected venue, preserving the venue identity and the customer's current event requirements.
- [ ] Find a published venue contact address and retain its source; if none is found, explain the missing contact instead of inventing an address.
- [ ] Ask for date and time availability, capacity, the all-in price including required fees or deposits, cancellation terms, and the next reservation step.
- [ ] Ask the customer only for missing information that materially affects the inquiry; do not ask permission for ordinary public research.
- [ ] Let the customer review and edit the recipient and message, and persist the draft on the same conversation.
- [ ] Reload restores the draft, its venue, and its event details without sending mail.
- [ ] A changed venue or material brief change makes the old draft visibly out of date before it can be sent.
- [ ] Verify the complete draft-and-reload journey in the local browser using a real saved proposal.

## Verification and boundaries

Use real-run-first verification and existing checks.
Add a focused regression only if a reproduced failure warrants it.
This ticket drafts an inquiry only; it does not send, reserve, charge, or promise availability.
Keep Leo's existing design and coordinate any shared email or contract work with Ujjwal.
Do not add a second email integration before checking whether the existing configured integration can support the next tickets.
