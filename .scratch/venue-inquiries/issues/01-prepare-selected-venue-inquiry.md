# 01: Prepare an inquiry for the selected venue

**What to build:** A customer can turn their saved venue selection into a clear inquiry draft asking about event-date availability, the full price, and cancellation terms.
The draft is attached to the same planning conversation and survives reload.

**Blocked by:** Stage two: Keep customer choices through changes and return visits, including resolution of its outstanding review findings.

**Status:** implemented locally; controlled checks pass; real browser verification pending

Owner: Tony.

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

## Implementation checkpoint

PR #59 is merged as `b986ab636725029fc6c1b694a1c34494a42a7bca`.
The local `feat/planning-inquiry-drafts` branch implements preparation and editing through the existing planning command endpoint.
The inquiry includes a saved venue snapshot, draft revision, contact source when available, and source conversation message IDs.
It is stored in the existing conversation record, so no schema migration is required for this slice.

The initial draft uses a deterministic inquiry template containing the customer's requirements in order.
It does not make an additional research or language-model call.
Only an email explicitly present in saved published evidence is prefilled; otherwise the address remains empty.
Finding an address not already in the saved evidence remains a follow-up research task.

The customer can edit and save the draft, then reload it.
A changed venue or new customer message marks it stale.
A concurrent draft edit retains typed text and offers an explicit way to load the newer saved draft.
Sending and supplier reply interpretation are not connected in this slice.

Controlled verification covers persistence through the migrated repository, stale revisions, replay, missing contact evidence, and rendered editing through the real client and hook with controlled fetch.
No live browser, email, supplier contact, or payment claim is made.
Before shipping, run the draft preparation, editing and reload recipe in the separate browser-testing session.
