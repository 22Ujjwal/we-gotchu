# Arrange in Naive

The controlled supplier workflow uses one company agent, one skill, one identity and one outcome.
Research currently uses the existing research agent configuration.
This does not yet consolidate every application task into one agent.

Upload `arrange-supplier-coordination.md` as the `arrange-supplier-coordination` skill and attach that slug to the company agent's skills.
Create the identity from `company-identity.json`, then attach it to the company agent using `identities.attach`.
Creating an identity alone does not authorize an agent to use it.
Create the outcome from `supplier-outcome.json`.

Configure `NAIVE_COMPANY_AGENT_ID`, `NAIVE_COMPANY_IDENTITY_ID` and `NAIVE_COMPANY_OUTCOME_ID` privately in the application environment.
New supplier sessions pass the identity and outcome explicitly.
Existing sessions retain their original agent version.
Changing the agent does not update a session's old tool endpoint or instructions.

The outcome evaluates one supplier turn.
A truthful wait for a reply or a concrete request for customer input can complete that turn.
It does not mean the whole arrangement is booked.

The company agent uses the application's scoped MCP tools to read the selected event and save an authorized inquiry or follow-up.
AgentMail credentials remain in the application.
No Naive Computer or duplicate mail connection is required for this API workflow.
Incoming mail must still reach the application's signed webhook and background worker, which starts the agent's next turn.
Skills and outcomes do not provide that event trigger by themselves.

Use natural email wording without test labels, while retaining controlled mode in application state.
The application must preserve the approved recipient, selected items, original supplier evidence and stable send request ID.
Customer approval and Stripe test payment remain separate steps.

Verify resource creation and agent attachments with read-back calls.
Then verify a real controlled reply with the customer browser closed.
A successful upload or passing typecheck does not establish that the background journey works.
