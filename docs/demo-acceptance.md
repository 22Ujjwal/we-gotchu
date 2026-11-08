# Demo acceptance draft

Status: proposed acceptance checklist for implementation, not a claim of completed tests.
The demo has one event, one venue, and one supply purchase.
Three candidate venues can illustrate the happy path without imposing a product limit.
The ordered build steps, owners, and fallbacks are in the [demo plan](team/demo-plan.md).

## Must pass for the demo

- Intake accepts a brief, with a "Use demo brief" shortcut.
- The agent's research returns candidates with source URLs, and a different brief gives a different plan.
- The plan names both commitments, the total with a zero service fee, cancellation terms, and the agent's reasons.
- One approve-and-pay step authorizes both commitments and opens Stripe Checkout for that total.
- Payment is confirmed by the Stripe webhook, never by the success URL.
- After payment, the agent executes the venue and then the item, and each shows a provider reference and its mode.
- One cancel step leads the agent to cancel both commitments, and the customer refund shows Stripe's reported state.
- The progress log shows each agent decision and marks the two human steps.
- Reloading the browser restores the event and its progress from the server.

## Guarantees to test

- Calling execute_action twice for the same action returns the existing attempt and does not call the supplier again.
- execute_action is refused without an approval, after the approval expires, before payment, and after cancellation.
- A second delivery of the same Stripe webhook changes nothing.
- One signed-in customer cannot read another customer's event.
- The MCP endpoint rejects requests without the bearer token.

## Post-hackathon checks

These remain requirements for a real product but are not needed for the demo:
stale plan revision handling through plan editing, supplier timeout reconciliation against a live supplier, cancellation racing an in-flight live purchase, partial-failure compensation, full keyboard and reduced-motion review, and Playwright journey tests.

## Live evidence and fallback

The transaction owner captures Stripe references without sensitive card details.
The agent owner captures supplier references and cancellation results for any live supplier step.
The pitch owner labels every recorded or simulated segment before presenting it.
The live, test, or simulated mode is visible in the UI and retained in the records.
A browser click, agent message, local spend entry, or Checkout return URL alone is not purchase evidence.

Before collecting live money, verify the selected suppliers, account eligibility, supplier funding, secure checkout, and refund policy.
If any prerequisite is missing, use Stripe test mode and simulated suppliers for that portion.
Do not turn a simulated or test payment into live supplier spending.
A valid demo can end with cancellations confirmed and refunds pending if that is what providers report.
Do not claim refunded money has arrived without evidence.
