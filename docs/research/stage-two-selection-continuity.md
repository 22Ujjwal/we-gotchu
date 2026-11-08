# Stage two: selections and follow-up continuity

## Result

Local browser verification passed on code revision `10efa51b23bca4a303958c2be8f5f838313e981f` after a fresh local database reset.
The customer created a picnic proposal, selected its venue, requested cheaper plates, closed the tab during research, returned, and reloaded the completed result.
The selected venue ID and full saved snapshot remained unchanged.
No supplier contact, booking, payment, or production verification occurred.

## Failure and fix

The earlier browser run displayed the original answer again after a follow-up.
Its saved record contained the original proposal at completion sequence 182, while the provider's completion event and later session snapshot contained the new comparison.
The adapter previously trusted the session snapshot's structured output alongside its latest sequence.
It now reads structured output from the matching `session.idle` event and waits when that completion event is unavailable.
The bounded event read includes the latest sequence even when a turn exceeds one page of events.
A same-sequence correction can replace the saved proposal and existing assistant message without another provider send or duplicate message.

Two focused regressions reproduced the stale-output and saved-answer failures before implementation.
Additional coverage checks completion beyond the first event page and rereading the saved completion cursor.

## Fresh browser evidence

Conversation: `planning_c55c0809-14d6-4e19-b961-4b8a325f11c0`.
Hosted session: `ses_xbpn343nkq7ax6m31w3jt18mx6`.
Initial browser submission occurred at 2026-11-08 09:51:45.484 UTC.
The first proposal was observed by 09:52:55 UTC.
The follow-up was submitted once around 09:53:13 UTC.
The tab closed at 09:53:20 and reopened at 09:53:58 while research was still working.
The new proposal was observed by 09:54:19 UTC.
These are browser observation times, not exact provider latency measurements.

Read-only provider inspection after server shutdown found one initial user message and one follow-up in the same session.
The first completion event was sequence 81 at 09:52:51.053 UTC.
The follow-up completion event was sequence 160 at 09:54:17.854 UTC.
The final saved proposal matched the provider snapshot.
The local request ledger held create, selection, and follow-up requests.
This establishes one accepted initial message and one accepted follow-up in the inspected session, not a complete count of HTTP attempts.
Reported provider consumption was 157184 micro USD.

The venue was Picnic at Transit at Presidio Tunnel Tops.
The original product was a Party Favors Plus 24-pack of white 9-inch plates listed at $4.45.
The replacement was a Zurchers 24-pack listed at $3.47, a $0.98 merchandise difference for one required pack.
The response disclosed that the original was now sold out, Zurchers stock was in Utah, and San Francisco shipping, tax, and delivered savings were unverified.

Sources:
- https://partyfavorsplus.com/products/party-favors-plus-white-paper-dinner-plates-9-inch-24-count
- https://zurchers.com/products/white-dinner-plates-24-ct

Sanitized browser evidence remains locally under `.scratch/verification/stage2-fresh-reset/`.
Read-only provider evidence remains under `.scratch/stage2/fresh-provider.json`.
The owned browser server stopped after verification.
Sign-in and the fresh local database were preserved.

## Remaining limits

Two native `web_fetch` calls returned `the web provider answered 429` at 09:52:10.480 and 09:52:17.294 UTC.
The research still completed; the errors do not establish request-quota exhaustion.
Browser network capture was incomplete, and the preview reported itself invisible.
Server aborted-request messages appeared in the browser console.
No duplicate accepted messages appeared in the inspected provider trace, but complete HTTP request counts remain unverified.
The UI activity history, output presentation, image integration, and purchase readiness are separate work.

## Review follow-up

The independent review reported a successful browser follow-up on application code matching `92b88d2` and three adapter edge cases that were not triggered in that run.
Controlled regressions reproduced those three cases before the fix.
The adapter now finds the newest relevant completion across event pages rather than requiring completion to be the last event.
It returns the completion's own sequence so trailing bookkeeping events cannot become the answer cursor.
The service explicitly identifies an already completed cursor for rereads; a newly accepted message cannot reuse the previous answer at that cursor.
An idle snapshot without a completed turn and output remains waiting instead of reporting a malformed answer.
Malformed output at an actual completed turn still reports failure.

The regression suite includes more than one page of trailing events.
At implementation commit `a3ed53d`, Bun 1.4.4 frozen install, 489 tests across 42 files, typecheck, production build, 25 coordination tests, and whitespace checks passed.
This follow-up did not rerun a live browser or paid provider session.
The earlier browser reports remain evidence for their recorded revisions only.

Saved customer selections remain authoritative even when a later proposal omits those options.
This preserves the requested venue instead of silently undoing a customer decision.
Activity remains a current status projection rather than a persistent history; a durable activity history is deferred UI work.
Product source mismatches and stock freshness remain research-quality limitations, not resolved by this adapter change.
