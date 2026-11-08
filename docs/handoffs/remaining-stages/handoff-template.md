# Work handoff

## Identity

- Owner:
- Feature and scope:
- Branch and base SHA:
- Final tested SHA:
- Owned files:
- Shared files requiring integration:

## What changed

Describe the customer or integration behavior now possible.
List exported functions, route paths, contract version, storage changes and required configuration names without values.
State which existing behavior remains compatible.

## Evidence

| Check | Exact command or action | Result | Evidence location |
| --- | --- | --- | --- |
| Focused local check | | | |
| Typecheck | | | |
| Required suite and build | | | |
| Provider send or receive | | | |
| Browser journey | | | |
| Hosted verification | | | |

Record full SHA, environment, timestamps and sanitized provider references.
Mark checks not run as unverified.
Distinguish provider acceptance, actual delivery, incoming reply, interpreted quote, customer payment and supplier commitment.

## Integration instructions

List commits in adoption order and identify any prerequisites already included.
Do not ask the integrator to cherry-pick duplicate prerequisites.
Describe schema or runtime changes Tony must integrate.
State which commands need an isolated test database and which may contact external providers.

## Limitations and cleanup

List unresolved failures, provider limits and follow-up work.
Record processes started and stopped, preserved records and evidence files.
Confirm that no credentials or raw private data were committed.
Specify whether any supplier contact, real payment or purchase occurred; do not imply one from simulated evidence.
