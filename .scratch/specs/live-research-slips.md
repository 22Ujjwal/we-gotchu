# Live research paper slips

Status: deferred design direction, not an implementation ticket.
Owner: Tony, with frontend coordination.

## Customer experience

Keep the animated paper-slip design introduced in PR #60.
While the company works, customers should see useful actions and findings appear on those slips instead of waiting for a final chat response.
The customer's request determines the work and the number of slips; do not force every event through seven fixed steps.
Slips can show the brief, venue investigation, required supply quantities, listed prices, open questions, supplier inquiries, and comparisons as those become available.
Animate new information arriving and preserve completed work for inspection after research finishes.
The goal is to make the company's work visible and understandable without asking customers to supervise routine research.

## Implementation direction to revisit

Use recorded provider actions, results, and persisted application activity to update the presentation.
The agent can supply concise explanations of actions and findings alongside those records.
Slips do not need to be literal files written by the agent; choose the smallest mechanism compatible with saved conversations and reload.
Display actual elapsed time when useful.
A percentage or completion estimate needs a defined basis; otherwise show current activity and completed work rather than a timer pretending to measure completion.
Keep supplier quotes, estimates, missing information, and failed lookups distinguishable in plain language.
Preserve Leo's visual design and avoid exposing raw tool logs or credentials.

## Reference and scope

Visual reference: Tony's attached paper-slip screenshot, image_a8fdd84e-d6e5-43ac-bbd0-b714c675e6ee, supplied on 2026-11-08.
The screenshot shows the brief, venue hire, supply desk, venue details, terms, estimate, and shortlist cards beneath a percentage.
Those cards illustrate the visual direction, not a required fixed workflow.
This is deferred and does not block stage-two shipping or stage-three venue inquiries.
No runtime UI or agent changes are authorized by this note alone.
