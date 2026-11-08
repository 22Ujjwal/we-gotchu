# Stage-three draft browser verification

The draft-only customer workflow passed locally on `f452e5503f30f2d57395cc21f474b3b67d946f99` on branch `feat/planning-inquiry-drafts`.
This report records browser observations and saved snapshots, not a new automated suite run or a hosted deployment check.
The local checks preceding this run passed 536 tests, typecheck, build, and 25 coordination tests.

## Observed journey

The saved conversation `planning_c55c0809-14d6-4e19-b961-4b8a325f11c0` rendered by 2026-11-08 10:41:40 UTC.
An explicit authenticated saved-state GET returned 200 with version 9 and ready status.
The selected venue was `venue-picnic-at-transit`; no supplies were selected.
The proposal included an unselected Zurchers 24-count supply option at USD 3.47.

At 10:41:48, preparing the inquiry created revision 1 and conversation version 10.
The draft referenced the selected venue and customer requirements.
Its recipient was empty and contact source null, matching the absence of a published address in the saved evidence.
Sending was unavailable and no send approval control appeared.

At 10:42:06, the tester saved an edited subject and message with `qa@example.com` as an unsent test recipient.
The inquiry retained its identity and advanced to revision 2, conversation version 11.
An actual browser reload retained the exact edited fields and selection snapshot.

Removing the venue at 10:42:45 advanced the conversation to version 12 and marked the draft stale.
Save was disabled and an out-of-date notice appeared.
Reselecting the original venue advanced the conversation to version 13; the old draft remained stale.
Explicit replacement created a new inquiry at revision 1 and conversation version 14 by 10:43:13.
The final proposal and selections matched the pre-run snapshots exactly.
The lead independently compared the stored evidence files and confirmed these equality and staleness checks.

## Limits

Bounded network capture did not retain the mutation requests, their bodies, or their HTTP statuses.
Command kinds are inferred from UI actions and saved state changes; request uniqueness is unverified.
The explicit saved-state GET 200 was observed directly.
A text wait missed an input value and one preview selector was rejected before action; neither establishes a product failure.
The final bounded console snapshot contained no errors, but cannot establish that no earlier errors occurred.
The preview reported itself invisible despite a request to display it.

No provider refresh button, new research, customer follow-up, inquiry approval, email, payment, or booking was performed.
Concurrent editing and actual send behavior were not exercised by this browser run.
Reply interpretation and offer display remain incomplete.
The initial saved-load blocker was absent in this run; the cause of the earlier 503 remains unconfirmed.

## Evidence and cleanup

Sanitized snapshots, diagnostics and a screenshot remain locally under `.scratch/verification/stage3-drafts-f452e55/`.
The video attachment ends in `4a2d273b-1127-472b-ae32-03af1c49b7e9-mp4.mp4` in the local userdata attachments directory.
The tester stopped the owned Bun 1.4.4 server and preserved sign-in, the result tab, saved records and configuration.
No code or configuration changed during the browser run.
The next external verification is the approved controlled-inbox send after the real transport is integrated.
