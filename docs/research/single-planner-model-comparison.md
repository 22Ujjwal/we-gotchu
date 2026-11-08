# Single-planner model comparison

These are local live SDK trials on November 8, 2026, not deployed or browser acceptance results.
Each trial used one hosted planner, native public data tools and a USD 0.50 session cap.
The brief requested a quiet Berkeley meetup for eight people on December 19, 2026, from 2 to 5 p.m., with a USD 200 total budget and disposable cups.
No supplier contact, booking or purchase occurred.
The proof runner stopped each session after collecting its result and trace.

| Agent version | Model | Proposal time | Recorded session spend | Assessment |
| --- | --- | --- | --- | --- |
| 5 | z-ai/glm-5.3-flash | 91.301 seconds | USD 0.012126 | Missed time target; weekday-only venue with an estimated three-hour cost of USD 587 for a Saturday event. |
| 6 | anthropic/claude-sonnet-4.6 | 75.681 seconds | USD 0.143022 | Faster, but venue rental alone exceeded the budget and the supply pack contained 100 cups. |
| 7 | anthropic/claude-sonnet-4.6 | 53.492 seconds | USD 0.100149 | Better venue type, but inconsistent supply prices and unsupported pack evidence prevent acceptance. |
| 8 | openai/gpt-6.1-terra | 51.575 seconds | USD 0.040733 | Clearer 20-cup listing and subtotal, but venue still needed a rate clarification and its higher listed rate exceeded the budget. |
| 9 | openai/gpt-6.1-sol | 60.169 seconds | USD 0.058580 | Accepted as a quote-needed first shortlist: rejected known mismatches, named Finnish Hall as an inquiry lead, and reported one 20-cup pack at USD 11.49 with evidence-age and cost limits. |

Versions 5 and 6 used the same prompt and tools.
Versions 7, 8 and 9 used the same revised prompt and tools at local commit 1027b98.
The revision asks for affordable venue types, rejects known budget or date mismatches, and favors modest supply quantities.
Do not attribute improvements across versions 6 and 7 solely to the model.
These are single trials, not reliable latency or quality benchmarks.
Session spend is the provider's recorded consumed_micro_usd value, not an independently reconciled invoice.

## Evidence

- Version 5: proof f05edefb-d328-4109-8ca0-1d328c2173b0, session ses_2rmn36p91k0a6ar2eg7n6880q6.
- Version 6: proof 37fac750-f15b-40bc-a4d8-dc9100a4d63d, session ses_vmmm6xmdd15vb9ejp6v0amahkq.
- Version 7: proof 373f7229-167f-487b-b21b-8586db6f460c, session ses_vaxatvqwcmswn4knbfc14npv84.
- Version 8: proof 2046fd51-843d-416b-998c-505664b7af8a, session ses_3r5b87jnf3dby0gpbwjh60mgnm.
- Version 9: proof 0b9f2a2d-c276-4454-9d1f-0f59fd0c3d69, session ses_3n9b8qymtbxdhpzc7nj5yj0ehb.

Ignored local traces are under tools/agent-research-proof/output/planning-<proof>/result.json and events.json.
Versions 6 through 8 each completed six research calls and submit_output, with no recorded approval events.
Version 7 had one web_fetch error; versions 6 and 8 had no recorded tool errors.
Version 9 had no recorded tool errors and used native tool discovery followed by three public data runs.
All five quoted facts in version 9 occur verbatim in the retrieved tool output, with their source URLs present.
The source excerpts are not current supplier quotes, availability confirmations or proof of total budget fit.
The product excerpt was indexed in August 2024, which the proposal discloses.
Acceptance here means a sourced next action, not a verified purchasable plan.

## Different-brief check

The same Sol version 9 also researched a San Francisco adult birthday for 20 people, December 12, 2026, 6 to 9 p.m., with USD 500 for a venue and paper plates.
Proof 3e7b9c8a-03ab-4547-95fc-38d24cf74f34 used session ses_bzv9kchgx75bvhh5wpm642w2hn.
It returned in 54.091 seconds and recorded USD 0.056308 session spend, with no recorded tool errors or approval events.
It rejected a venue whose starting rate exceeded the budget, returned no venue option, and proposed three eight-packs of Toy Story plates for USD 50.97.
It disclosed the character theme, but that does not make the product a useful adult-birthday recommendation.
The literal source URL and full quoted product title did not match the serialized retrieved outputs in the local comparison; this needs inspection before acceptance and is not by itself proof of an invented source.
This run fails the useful venue-and-supply proposal milestone despite meeting the latency target.
At this point the original pair of briefs did not both pass, and browser acceptance remained pending.

The local single-planner setup accepts NAIVE_PLANNING_MODEL independently of NAIVE_MODEL.
The local setting is openai/gpt-6.1-sol for further investigation, not a declared benchmark winner.
The legacy team and its model configuration remain unchanged.

## Picnic brief and browser handoff

Tony confirmed that the demo does not have to use Berkeley.
A third brief requested an outdoor birthday picnic for 12 adults in San Francisco on December 12, 2026, noon to 3 p.m., with USD 300 for a public shared picnic location and plain disposable dinner plates.
No exclusive space, catering, alcohol, decorations or supplier contact was requested.
Sol version 9 returned in 53.268 seconds, with USD 0.047724 recorded spend.
Proof a75dd286-a4e1-441c-bf5e-31c33a2080cd used session ses_562xpvxf0fcdx9jdzjgk9e0eqr.
It proposed Crissy Field East Beach and one 16-count pack of Chinet Crystal dinner plates listed at USD 6.99, leaving four spares.
All four quoted facts and their source URLs occur in retrieved tool output.
There were no recorded tool errors or approval events.
The venue facts came from official-site search excerpts; the product price came from a Target related-product listing, which the answer disclosed.
Park permissions, fees, access, seating, weather and local stock remain unverified.
This passes a useful first proposal, not procurement or a confirmed total.

The Berkeley quote-needed lead and picnic shortlist support trying the actual local browser flow with Sol.
The failed adult birthday run remains a product-quality limitation; do not describe all briefs as reliable.
Use the picnic brief for the browser rehearsal, without hardcoded results.
Keep model openai/gpt-6.1-sol and agent agt_t6445gy3v6jt6jfre51019qtyz at version 9 frozen during that run.
Browser submission, rendering and reload are still unverified at this handoff.

## Further provider recurrence

The native web fetch still returned a 429 during version 7, even though native web_search was disabled.
The event contains no HTTP request ID or Retry-After header.
Do not infer account quota exhaustion from this message.

```text
UTC: 2026-11-08T08:37:08.173Z
Session: ses_vaxatvqwcmswn4knbfc14npv84
Event: evt_e7pe0mtpwczcd85222qpsd6ffq
Sequence: 21
Tool: web_fetch
Tool call: toolu_bdrk_01H4m2TuEi6busPdLyv4JzZy
is_error: true
Output: the web provider answered 429
```

The session still produced a proposal.
The error and the inconsistent supply answer are separate findings; this trace does not prove that the error caused the pricing mistake.
