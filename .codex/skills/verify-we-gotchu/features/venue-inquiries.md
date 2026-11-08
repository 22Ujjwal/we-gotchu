# Venue inquiries and supplier replies

## Sub-features

Prepare and edit a draft for the selected venue, restore it after reload, invalidate it after changing venue, and explicitly replace an outdated draft.
Review the exact saved recipient and text before sending through a configured transport.
Read original supplier replies, interpreted facts and missing information without rerunning research.
Controlled replies must remain labeled as controlled tests.

## How to get to it (user POV)

Open a saved /planning/$id conversation and select a venue.
Choose Prepare venue inquiry below the options.
The inquiry editor and supplier replies remain on that conversation page.

## Driving it with the shared browser

Record the exact SHA, conversation ID, selected venue and selected supply snapshots before changing anything.
Prepare once and record the new inquiry ID, draft revision, recipient and contact source.
Edit Venue email, Inquiry subject and Inquiry message, then click Save inquiry draft once.
Reload with Command-R and compare exact saved fields and selection snapshots.
Remove the selected venue and confirm the stale warning and disabled Save control.
Reselecting the same venue must not silently restore an old approval.
Replace outdated inquiry draft explicitly and confirm a new inquiry ID.

If mail is not configured, verify that no Approve and send inquiry control appears.
If mail is configured, use only the explicitly approved controlled inbox and message.
Save edits before approving, then approve the exact recipient and saved message once.
Record the request ID and provider message/thread references when available.
Provider acceptance is not recipient delivery.
Never resend an uncertain operation to obtain a clean result.

Deliver a controlled reply through the real signed webhook when the transport is integrated.
Close the customer tab during reply processing, then reopen and inspect the saved reply and its original message.
A supplier question needs a useful next action, not an invented quote.
A quote without currency, required charges or terms must retain those unknowns.
Use Check for venue replies and verify it reads ?saved=1 without a research refresh or mail write.
Send a duplicate webhook and confirm one stored reply and one interpretation job.
Deliver an older reply and confirm it remains separate from the newer reply.

## Gotchas

The isolated local helper below seeds a new controlled conversation and mocks incoming email at the application callback.
It calls the real hosted model for interpretation but does not send or receive real email.
Its browser results prove reply presentation and restoration only, not the integrated mail workflow.
It must never be described as a real supplier quote.
Run it only while no server owns the local PGlite directory.

`NODE_ENV=development REPLY_LIVE_PROOF=1 bun --env-file=.env.local tools/planning-reply-proof/run.ts EXISTING_LOCAL_CONVERSATION_ID`

The existing conversation supplies only the authenticated owner; its records are unchanged.
The helper prints the new controlled conversation URL and writes sanitized evidence under .scratch/verification/reply-proof-*.
Start the browser server after the helper closes its database connection.
Preserve evidence and controlled records after cleanup.
