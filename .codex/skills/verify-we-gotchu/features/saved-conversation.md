# Saved conversation

## Sub-features

Restoration of a saved brief and proposal after a browser reload.

## How to get to it (user POV)

Use the /planning/$id URL produced by research submission.

## Driving it with the shared browser

Record the visible proposal and response before reload.
Use Command-R or the browser reload API, then compare the restored brief, option IDs, prices and source links.
Record planning API reads and verify no create request occurred if complete capture is available.

## Gotchas

Same-URL navigation is not proof of an actual reload.
An incomplete network capture cannot prove the absence of writes.
Do not select options or send a follow-up unless that separate acceptance step is authorized.
