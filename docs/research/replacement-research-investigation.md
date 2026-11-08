# Replacement research investigation

The local browser run at cccb44f returned a venue but no usable supply option.
The saved conversation is planning_17140db4-c4cf-4eef-b30e-b6c70d54858a and its hosted session is ses_5x93f7e0480a3mwnpxw0y4fhrr.
After the browser server stopped, a read-only local database transaction recovered the session ID.
Read-only provider event retrieval saved the trace in ignored tools/agent-research-proof/output/browser-picnic-events.json.
No conversation record, supplier or previous session was changed.

## Observed behavior

The six-call instruction counted discovery and schema inspection as research work.
The trace contains exactly six calls before submit_output:

1. Discover native tools.
2. Find Search Web Pages.
3. Inspect the search schema.
4. Search for a picnic venue.
5. Search for dinner plates.
6. Fetch the selected Target product page.

All calls returned without a recorded tool error.
The fetched page said Product not found and Item not available.
That establishes an unusable listing, not a temporary stock shortage or a provider timeout.
The agent submitted a venue-only proposal without another supply search.
The prompt explicitly told it to submit when it reached six calls, including discovery.
This is strong evidence that our stopping instruction caused the early termination; changing model alone would retain that instruction.

The recorded keyboard submission began at 08:45:54.962 UTC.
The hosted submit_output completed at 08:46:31.221 UTC, 36.259 seconds later.
This is provider-result timing, not verified browser render timing.
Terra navigated to the same URL and saw the proposal again, but did not capture a true reload or a complete GET-only network trace.

## Local change

Commit fab5a1a separates tool setup from an allowance of eight evidence retrieval calls.
It requires replacement research for an unavailable product, missing product page or known unsuitable candidate, with up to two replacement searches within that allowance.
It distinguishes those failures from an event-specific venue quote that may genuinely require supplier contact.
The 90-second target and USD 0.50 session cap remain unchanged.
This is a planner instruction, not a hard runtime enforcement of the retrieval count or deadline.
No new orchestration layer, response repair or hardcoded recommendation was added.
Sol remains the product planner; a different investigator model was not needed to recover this trace.

Existing planning tests passed 18 of 18, and typecheck and whitespace checks passed.
A live replacement trial supplies the actual failed listing as prior evidence to the same picnic brief.
That trial isolates replacement behavior; it does not substitute for another complete browser check.

## Live result

Agent version 10 used openai/gpt-6.1-sol with unchanged tools and spending cap.
Proof 5fd241ac-11d1-4fc7-ab8f-94639353a735 used session ses_atzjmpdb91caw5ksspn9979asg.
It completed in 88.655 seconds and recorded USD 0.094937 session spend.
The runner stopped its session afterward.
There were no recorded tool errors.
After three tool-setup calls, it used eight evidence retrieval calls.
It encountered a different unavailable Target plate page, then issued two replacement searches and returned a Walmart-listed Chinet 18-count pack at USD 8.11.
The retrieved category excerpt contains that product name, pack size and price, alongside other offers with different prices.
Its proposal explicitly disclosed category-page evidence, unverified stock and checkout price, and the fact that it had exhausted its evidence allowance before individual-page verification.
It also returned the Crissy Field East Beach venue with facts supported by the fetched official page.

This verifies that the revised instruction can recover from an unavailable listing instead of ending immediately with supplies unresolved.
It does not establish repeatability, current purchasability or a complete transaction plan.
The 90-second target has little margin in this run.
The actual browser flow must still be checked on the revised configuration.
