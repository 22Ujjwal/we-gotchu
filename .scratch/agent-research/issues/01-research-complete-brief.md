# 01: Research a complete brief using real sources

**What to build:** A customer submits an event brief and receives source-backed venue and supply candidates from bounded real research.

**Blocked by:** External prerequisite: Ujjwal coordinates the minimum shared input and result contracts and provides the test runner; Tony and Leo review the relevant fields. No implementation-ticket blockers.

**Status:** ready-for-agent

- [ ] Tony owns the research workflow and supplier adapters; shared schemas and root configuration remain with Ujjwal, and frontend rendering remains with Leo.
- [ ] The workflow accepts event identity, brief revision, run identity, and normalized event requirements and returns a versioned result carrying those identities.
- [ ] Missing essential requirements produce focused awaiting-input fields without paid searches, and already supplied fields are retained.
- [ ] One supported location and brief produce venue and supply candidates through verified existing integrations and hosted Naive pi, with the model configurable.
- [ ] Inspect existing sponsor tools before building equivalent capabilities; use the tested Monid REST path where suitable and require authentication and end-to-end proof before switching to MCP.
- [ ] Each candidate includes source references, observation time, evidence mode, and explicit unknowns; category pages remain discovery leads and the number of candidates is not fixed at three.
- [ ] Reject unsupported budget, availability, capacity, and cancellation claims even when structured output validates; discovery alone does not produce a bookable Event plan.
- [ ] Allow at most one correction for missing or malformed output using existing evidence without repeating searches; otherwise return a supported partial result or explicit failure.
- [ ] Configure time, call, result-page, and usage bounds; allow only inspected read-only endpoints, keep credentials server-side and outside prompts, and treat retrieved instructions as untrusted.
- [ ] Controlled workflow tests cover complete and incomplete briefs, source failure, malformed output, unsupported claims, and hostile source instructions without asserting private call order.
- [ ] An opt-in live smoke test verifies the selected discovery tools and Naive together, records exact versions and evidence, and cleans up evaluation resources; fixture results cannot silently replace live results.
