# Linked external reply verification

This records a local controlled test on November 8, 2026 at application commit `cbfb2309e02d3da4c88641487a159b74fe0c41bf`.
The recipient was a team-controlled external Gmail inbox acting as a pretend supplier.
No real venue was contacted or reserved.

## Observed journey

The browser sent one approved inquiry at approximately 15:06:03 UTC and then closed the customer tab.
The saved inquiry was `inquiry_2f458318-6a26-45b3-b1cd-015521406d60`, revision 2, in conversation `planning_5518336b-8801-4672-9ce6-8d4fe5e10db5`.
The provider accepted it at 15:06:04.379 UTC.
The recipient replied "Got it" in the same thread.
Read-only provider inspection confirmed that incoming message and its reference to the outgoing inquiry.

At 15:10:00 UTC, an authenticated saved-only GET returned HTTP 200 and conversation version 25 before the detail page was reopened.
Reply `reply_89342d6a-2af6-46e8-91c1-a906919f3fc4` was already ready, linked to receipt `receipt_49a1725c-b22b-47db-b1f1-e41141ce651c`.
The retained incoming timestamp was 15:06:19 UTC.
No refresh, retry, manual worker invocation or new send preceded this read.

The interpretation classified the response as an acknowledgment, with no extracted facts.
It did not mistake the quoted outgoing inquiry for supplier-offered terms.
Availability, capacity, price, taxes, fees, deposit terms, cancellation and expiry remained missing.
The saved offer and payment link were both absent.
The page displayed the acknowledgment and missing terms, and an actual browser reload retained them.

## What this proves

The local application received and interpreted a real external reply while the customer tab was closed.
The first saved-only read supports completion before reopening.
The saved response did not contain a processing-completion timestamp, so it does not prove the exact processing duration.
The browser capture was bounded and does not independently prove unique network requests.

This is controlled mail evidence, not a genuine venue quote, reservation or completed procurement.
A complete quote-to-offer-to-payment journey on this conversation still requires separate verification.
Earlier sandbox payment evidence belongs to a different controlled conversation and must not be presented as this same continuous run.

## Retained local evidence

The sanitized first-read record is `.scratch/verification/linked-reply-cbfb230/first-saved-read.json`.
It contains the reply, original wording, classification, selected option IDs and absent offer/payment state.
These local artifacts are not committed or available to reviewers through GitHub.
The report above records the bounded result without relying on those paths being accessible remotely.

## Checks on the same application revision

Type checking passed.
The application suite passed 667 tests in 64 files.
The local tooling suite passed 31 tests.
The frozen dependency install and Vercel-targeted build passed.
These checks do not establish deployed behavior or live supplier fulfillment.
