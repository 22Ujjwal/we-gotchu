# Repeated native web search errors

Observed on 2026-11-08 between 07:33:31 and 07:33:43 UTC.
The application uses the managed-agents SDK 0.12.3, pi harness and z-ai/glm-5.3-flash.
Two specialists were researching public event venues and paper plates concurrently.

Four native web_search calls returned this exact tool result:

```text
the web provider answered 429
```

Parent session: ses_7jnnfnpcxk0y1vaj8y7qxk72ja.

| UTC time | Specialist session | Event sequence | Tool call ID |
| --- | --- | --- | --- |
| 07:33:31.480 | ses_5w3q179wpx9yz302hmynw0qj4a | 30 | call_bdAVtSq5scSSpHD5CrN7IZv6 |
| 07:33:31.481 | ses_5w3q179wpx9yz302hmynw0qj4a | 31 | call_ooEnBcm3BbpBZQRSvhBnRamD |
| 07:33:32.056 | ses_mbavg45jsvc1ka3svt2j96mkvt | 18 | call_vt5pMcWQLjiCU0NCHfQWoOI1 |
| 07:33:43.214 | ses_mbavg45jsvc1ka3svt2j96mkvt | 21 | call_pt0ym2awlhUWEF7BrPyZUETc |

These errors appear inside tool.completed events.
The event data does not expose the underlying HTTP headers, Retry-After or provider request ID.
We cannot identify the upstream vendor or establish quota exhaustion from this evidence.
Other native searches and page fetches succeeded in the same run.
There were no tool.confirm events in either specialist's audited trace.
This is separate from the earlier Monid approval wait and from control-plane API capacity errors.

Could you confirm which upstream limit applied, whether native web_search retries these responses, and the recommended concurrency or backoff for two research specialists?
The test was bounded and its parent and specialist sessions were canceled afterward.
No bookings, purchases or supplier messages were performed.

## Delegation schema discrepancy

A separate fresh run reproduced a typed-delegation discrepancy.
Parent session ses_6wh6pk7349ev6fh2yd5bmhb5bj uses Tom version 5.
Its tool.started events 14 and 15 both contain send_to_agent arguments with wait=true and an object output_schema.
The matching tool.completed events 16 and 17 acknowledge these child sessions:

- Maya: ses_brjn924vyf14e4sm474g9sh1nt.
- Sam: ses_r1rgad9vn06ypgjeag0vg0mqvy.

A subsequent sessions.get for each child returned no output_schema.
The specialist agent definitions themselves also carry an output schema and structured_output_required=true.
Both specialists use the pi harness, which the delegation documentation says supports typed results.

In the earlier run, Sam explicitly reported that submit_output was unavailable and ended with free-form research and structured_output=null.
We have not established the provider implementation cause.
Could you confirm whether output_schema should propagate from send_to_agent and whether there is a required setting we are missing?
Reference: https://usenaive.ai/docs/team/delegation.md#typed-results.

## Recurrence after the native team update

Parent session ses_3xj8ej2ye55jaw0d4zrzedn0ms uses Tom version 6 and specialists version 4.
Five more calls returned the same exact error on 2026-11-08.

| UTC time | Session | Tool | Sequence | Tool call ID |
| --- | --- | --- | --- | --- |
| 2026-11-08T07:44:10.971Z | ses_7jgkca7h8dw6z2ahx9qxp7k661 | web_fetch | 45 | call_RO7vklrmKYSQ9jF4169Fslql |
| 2026-11-08T07:44:19.321Z | ses_7jgkca7h8dw6z2ahx9qxp7k661 | web_fetch | 51 | call_225j5G7DLKxvgqbLCRY31FZN |
| 2026-11-08T07:44:19.321Z | ses_7jgkca7h8dw6z2ahx9qxp7k661 | web_search | 52 | call_Se3TfNR6VeGIV9qio2smszkX |
| 2026-11-08T07:44:22.223Z | ses_7jgkca7h8dw6z2ahx9qxp7k661 | web_fetch | 56 | call_AIfvx0EstUtspyTkARn6D09L |
| 2026-11-08T07:44:19.794Z | ses_832a3c7btgxbaxptg0mbjwassv | web_fetch | 38 | call_89psgVByo0eDntL9Wydu1KSz |

The full specialist traces contain zero tool.confirm events.
Sam returned a supply shortlist before cancellation; Maya continued venue research.
The test ended after its four-minute observation window without a customer proposal.
The test canceled its parent and both specialist sessions, with acknowledgements recorded.
These errors do not establish why the overall proposal failed to finish within the observation window.
