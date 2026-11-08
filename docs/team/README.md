# Team handoff

Status: draft package ready for team review.
There are four human owners: one pitch owner, one frontend developer, and two backend developers.
Tony owns agent workflow, Leo owns frontend, and Ujjwal owns transactions and integration.
The fourth teammate owns pitch; their name has not been specified.

| Role | Assigned teammate | Start document | Main deliverable |
| --- | --- | --- | --- |
| Pitch owner | Ferdinand | [Pitch brief](pitch.md) | Customer story, demo script, and evidence-backed presentation. |
| Frontend developer | Leo | [Frontend brief](frontend.md) | Intake through cancellation and refund status. |
| Agent-workflow developer | Tony | [Agent brief](agent-workflow.md) | Naive runtime, research, and supplier adapters. |
| Transaction developer | Ujjwal | [Transaction brief](transactions.md) | Shared contracts, state, approvals, payments, and worker execution. |

Read the [product baseline](../product-spec.md), [architecture draft](../architecture-draft.md), [contract draft](../contracts-draft.md), and [ownership rules](ownership.md) before starting.
Use the [demo acceptance checklist](../demo-acceptance.md) as the shared definition of working behavior.

## Integration order

1. Ujji completes the [foundation task](foundation.md) on the existing TanStack Start and Bun scaffold, with Tony and Leo reviewing the shared schemas.
2. The transaction owner establishes shared schemas, simulated fixtures, and API boundaries.
3. Frontend work proceeds against those fixtures while agent work verifies the runtime and supplier adapter contracts.
4. Integrate one simulated end-to-end event before enabling real supplier mutations.
5. Resolve payment account, supplier funding, secure checkout, supplier selection, and refund-policy prerequisites before a live run.
6. Rehearse the demo with truthful live, recorded, and simulated labels.

This order permits parallel work without each person inventing different event or approval states.
The current planning task stops here and does not begin these implementation steps.
