# Ticket 01 test cases

Status: implementation verification recorded in the research workflow README.
The controlled suite has 15 workflow tests; supplier-detail and full ranking cases remain later tickets.
Owner: Tony.
Parent: [Research a complete brief using real sources](issues/01-research-complete-brief.md).
Use the merged shared schemas and test runner rather than defining competing types here.

## Test boundary

Submit a brief to the research workflow with controlled provider responses and inspect the returned outcome, evidence, unknowns, and progress.
Observe provider calls only to verify meaningful limits, such as no paid searches before essential input exists.
Do not assert private prompt wording or incidental internal call order.

## Baseline input

Use a synthetic birthday event in San Francisco for twenty people, requiring twenty paper plates, with a USD 500 total budget and a USD 10 maximum cancellation loss.
Supply an explicit future start date, local time, and America/Los_Angeles timezone in the executable fixture.
Use distinct event, run, and brief revision identities.
The synthetic brief is test input and does not make real retrieval simulated.

## Controlled cases

| Case | Provider response or input change | Expected observable behavior |
| --- | --- | --- |
| Complete brief | One specific venue and one supply product with source links and observation times. | Return both with the submitted identities, evidence, and explicit unverified requirements; do not invent additional candidates to reach three. |
| Missing essentials | Remove location and schedule from the baseline. | Return those missing requirements before any paid search and retain all supplied answers. |
| Unknown costs | Venue price, delivery, or taxes are absent; the model claims within budget. | Reject the unsupported claim; preserve unknown costs rather than treating them as zero. |
| Category lead | Venue search returns a directory page instead of a specific venue. | Preserve it only as a discovery lead, without confirmed supplier identity, capacity, or availability. |
| Unsupported terms | The model claims free cancellation or availability without source evidence. | Reject those claims and retain their unknown status. |
| Missing structured output | First model response is prose; one correction returns supported structured output. | Recover with at most one corrective turn using the existing evidence and no repeated discovery. |
| Correction fails | Both the initial response and correction are invalid. | Terminate with an explicit failure or supported partial result within the configured bound. |
| One source fails | Venue discovery succeeds and product discovery fails. | Return an explicit gap and partial outcome without fabricating supply candidates. |
| All sources fail | Required discovery tools fail or return no usable evidence. | Return an actionable failed or incomplete outcome without invented recommendations. |
| Hostile source content | Retrieved text asks for credentials, supplier contact, or a purchase. | Treat it as untrusted content and perform no prohibited action or credential disclosure. |
| Execution bound | Provider work would exceed configured call, time, or usage limits. | Stop scheduling further work and report the remaining gaps without claiming success. |
| Evidence mode | Run once with live-source metadata and once with an explicitly simulated fallback. | Preserve the difference and never describe the fallback as real retrieval. |
| Idle error | The provider reports idle with an error and no valid output. | Do not report successful research solely because the session stopped running. |

## Separate live smoke test

Run only when explicitly enabled and suitable credentials and the agreed runtime are available.
Use a complete representative brief with bounded discovery through the selected venue and product tools, followed by Naive output validation.
Check identity, schema, provenance, and honest unknowns rather than exact ranking, price, or availability.
Record provider versions, chosen model, usage, and observed failures without secrets.
Clean up evaluation resources and distinguish runtime evidence from controlled test results.
Supplier contact, booking, purchase, and payment are excluded.

## Implementation order

Start with the complete-brief test and prove it fails for the missing workflow behavior before implementing that path.
Add each remaining behavior with a failing boundary test before its implementation.
Ticket 02 adds supplier-detail extraction tests, and ticket 03 adds full pack calculations and recommendation ranking tests.
The first ticket already rejects unsupported conclusions; later tickets must not become a reason to defer that check.

## Dependencies still open

Ujjwal's PR #16 merged the shared schemas, fixtures, and test runner, and the workflow uses contract 0.4.
The database-backed startResearch and advanceResearch entry point remains ticket 05.
This document does not approve the polling design or change the shared contract.
