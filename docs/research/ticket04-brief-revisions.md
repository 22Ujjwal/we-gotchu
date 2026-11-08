# Ticket04 brief revision handoff

## Scope

This branch starts at ce2d672408be7defc30fad4d09db47b39ba28054.
It changes only updateBrief in the application service, adds src/agent/brief-revision.test.ts, and records this handoff and the ticket status.
PR28's inspected service diff changes its import and approve handling, which are disjoint from these updateBrief edits.
No frontend, shared contract, root configuration, storage implementation, or lifecycle implementation changed.

## Already satisfied on the merged baseline

- Partial updates retain previously answered fields and create a new run with the current brief.
- Invalid known fields reject the update without changing stored answers or run identity.
- A missing location reports only location, rather than asking for previously supplied fields.
- Stale submissions fail with stale_brief rather than overwriting newer answers.
- Research outcomes retain event, run, and brief revision identities.
- Previously published outcomes become superseded and disappear from the current event view.
- Storage rejects an older completed response after a newer revision publishes.

The first four tests passed before production changes.
They call the application handlers with the real research integration and migrated PGlite storage.
The late-response test pauses a completed result after checkpoint validation and resumes it after newer research publishes, so it checks publication in storage rather than relying on an in-memory rejection.

## Gaps fixed

An older update could wait for cleanup while a newer revision completed.
When the older update resumed, its unguarded status write changed the newer event from researched to researching.
The handler now passes its brief revision to the existing conditional storage operation.
The regression failed with revision 3 incorrectly researching before this fix.

An array submitted as changes passed the object check and started another run with unchanged answers.
The handler now rejects arrays with invalid_input before storage or research changes.
The regression demonstrated that the old handler accepted the array and incremented the revision.

## Controlled provider coverage

A separate test runs the real discovery HTTP adapter against controlled responses.
Changing San Francisco to Oakland changes the venue query and candidate.
Changing 20 guests to 48 changes the supply query and candidate.
The revised budget reaches the ranking session input.
Unknown prices remain unknown and do not produce a bookable plan.
These tests make no external provider calls and do not establish live supplier availability or deployed behavior.

## Cross-ticket integration

Ticket03 owns quantity calculations and ranking policy.
This branch verifies that updated quantity and budget reach research, but does not claim that budget filtering or quantity adequacy is implemented on this baseline.
The coordinator must rerun the brief revision tests with ticket03 and verify its policy tests on the combined head.

Ticket06 owns checkpoint and session lifecycle.
An older update delayed during cleanup can still initialize its already superseded checkpoint when it resumes.
Current storage guards prevent it from publishing as the current result.
That initialization and cleanup ordering was reported to the chief for ticket06 assessment; this branch does not change that lifecycle.
The coordinator must rerun ticket06 integration tests with these status guards.

PGlite applies the committed migrations, but it does not prove concurrency behavior on a deployed Neon instance.
No live sign-in, recovery, billing, supplier contact, payment, or deployment was attempted.
The merge coordinator must leave deployment verification to its owner.
