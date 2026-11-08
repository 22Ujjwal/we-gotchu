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

## Single-planner recurrence

The single-planner Berkeley run used version 4 of agt_t6445gy3v6jt6jfre51019qtyz.
Session: ses_6qjnndzmjk773af2az4td9wfw1.
No delegation was involved.

| UTC time | Tool | Sequence | Tool call ID | Exact error |
| --- | --- | --- | --- | --- |
| 2026-11-08T08:27:39.351Z | web_search | 7 | call_huy8JrUc5I0kr77whaWYnLNp | the web provider answered 429 |
| 2026-11-08T08:27:39.351Z | web_search | 8 | call_HGmE5sf95vDYq0teSW2GOlVz | the web provider answered 429 |
| 2026-11-08T08:27:39.547Z | web_search | 9 | call_Ox3QFYT1nwhMViFLm7BA5CUW | the web provider answered 429 |
| 2026-11-08T08:27:41.335Z | web_search | 13 | call_f1I0dztLaoQJgKuau0tdRtAW | the web provider answered 429 |
| 2026-11-08T08:28:12.794Z | data_run | 33 | call_Jm8lpJjc5wbRAsARSwWA1BkG | the data source refused the request (HTTP 400); check the input against the tool's schema |
| 2026-11-08T08:28:32.740Z | data_run | 39 | call_OWH55GnReyBtUmRwO5ykLcl1 | the data source refused the request (HTTP 400); check the input against the tool's schema |
| 2026-11-08T08:28:41.030Z | data_run | 42 | call_3JJEOVQU9osPHZnYdEX9ufyQ | the data source refused the request (HTTP 400); check the input against the tool's schema |
| 2026-11-08T08:28:42.940Z | data_run | 43 | call_2AHmNv8a8hAy7AUKD1jOOMNE | the data source refused the request (HTTP 400); check the input against the tool's schema |
| 2026-11-08T08:28:51.378Z | data_run | 45 | call_EQA0TLvXKEEpLmLxdf8pqd7b | the data source refused the request (HTTP 400); check the input against the tool's schema |
| 2026-11-08T08:28:58.164Z | data_run | 47 | call_AwbtZHd8F8HQbBreAA2DeQP8 | the data source refused the request (HTTP 400); check the input against the tool's schema |

The 400 responses occurred on Google Shopping Search and Google Maps Results data tools.
The agent inspected their schemas but omitted language fields on these calls; the returned schema descriptions mention language selection although the required array only contains keyword.
The provider did not expose the underlying validation reason, so this does not establish a provider defect.
Search Web Pages and several page fetches succeeded during the same run.
The agent repeatedly tried rejected data requests and exceeded the prompt-only research allowance.
The observation window ended without a proposal; cancellation was acknowledged.

## Unconfirmed session requests on November 8

These observations concern session request delivery, not a confirmed search-tool 429.
The application uses SDK 0.12.3, a 45-second fetch deadline, and a 55-second service deadline.

- At approximately 15:18:43 UTC, the Berlin customer sent one follow-up in conversation planning_3cb35532-fd17-43d3-a331-3b4754c0657d.
  The application saved the customer message but returned uncertain status around 15:19:27 UTC, without a new assistant response.
  A later read found session ses_jqbc31gj4v1mdcd0y61ewenmrw idle at sequence 89.
  Reading events after sequence 80 returned HTTP 200 with request ID req_vcmj0zxh850q1tst64ztx5mr2t and the initial turn's completion, with no follow-up acceptance in that bounded page.
- At 15:36:08 UTC, a fresh browser submission created conversation planning_57b5f280-a878-4be8-a0d4-51db4c07e375.
  The application POST returned 201 at 15:36:53.559 UTC, but the saved conversation was uncertain with no proposal or provider session available in the customer response.
  A subsequent SDK sessions.list read returned successfully in 879 milliseconds with has_more false and no matching conversation metadata.

The observed delays are consistent with the configured fetch deadline, but the application did not retain the underlying exception or response headers for these writes.
No HTTP status, provider error code, or provider request ID was captured for the failed writes.
Neither result proves that the provider rejected the request, and neither write was resent.
The browser evidence is retained locally under .scratch/verification/berlin-homepage-3b36b22 and .scratch/verification/automatic-inquiry-da6d045.

Support question: can you check session creation and message acceptance around these UTC times, and advise how to reconcile an uncertain create or send using the original idempotency key?
