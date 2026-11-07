# Stack and team proposal

Status: proposed, awaiting the team's decision.

Tony set the team split to one pitch owner, one frontend owner, and two other developers.
Tony asked that elapsed time not constrain this planning discussion.

## Proposed stack

Use TypeScript across the application, with Next.js and React for the customer interface and short server requests, Tailwind for styling, and Vercel for web deployment.
Use Neon Postgres for durable event, approval, supplier-action, payment, and refund records.
Use Drizzle for database access and migrations, and Zod schemas for shared request and response contracts.
Use Vitest for workflow and contract behavior, with Playwright for the customer journey.
These are recommendations rather than verified installed dependencies.

Evaluate the Naive Agent SDK and its runtime for supplier research and tool use because this is Naive's hackathon.
Also consider the team's OpenAI credits when choosing the model provider and billing route.
Naive SDK selection and OpenAI model usage are distinct decisions rather than assumed alternatives.
Verify whether the selected Naive integration supports the intended OpenAI model and the team's credited API account, or whether direct OpenAI calls are needed.
Do not assume OpenAI credits transfer to Naive or OpenRouter billing.
Verify the current SDK, model routing, pause and resume behavior, and deployment path before fixing that integration contract.
Run external work asynchronously and persist progress so the customer can leave and return.
Do not make a browser request wait through supplier replies or an entire booking workflow.

Use Monid for discovering and invoking useful supplier or product research tools where the catalog supports the actual task.
Use AgentMail for supplier email and processing booking, cancellation, and refund messages when email is part of the real supplier workflow.
Use Stripe Checkout and its refund APIs for the customer-facing payment portion.
Supplier payment remains a separate feasibility decision.
Stripe Connect transfers target connected accounts and do not establish a way to purchase from arbitrary venue or retailer checkouts.

## Team ownership proposal

The pitch owner owns the narrative, customer evidence, demo script, and presentation assets.
The frontend owner owns intake, plan comparison, approval, event progress, and cancellation screens.
The agent-workflow owner owns research, recommendation generation, tool invocation, supplier communication, and the Naive integration.
The transaction owner owns authoritative event state, approval enforcement, booking and order execution records, customer payments, refunds, database migrations, and webhook handling.
The transaction owner is the proposed integration and shared-contract owner.

## Contract requirements

Share versioned schemas for EventBrief, EventPlan, ApprovedAction, ActionResult, and EventSummary.
Include plan revision, action identity, currency and amounts, cancellation conditions, provider references, status, and evidence where applicable.
Tie approval to exact actions and a specific plan revision.
Make repeated submission of an approved action safe against duplicate bookings or charges.
Record requested, confirmed, failed, and pending states according to provider evidence rather than model-generated claims.
Choose exact states and schemas during the contract decision, not independently in each implementation.
Keep frontend code dependent on the shared API rather than direct database writes.
Changes to shared schemas require coordination with consumers before merging.
Assign each implementation ticket an owned file set and use separate branches or worktrees.
The proposed ownership split must be confirmed before it becomes a binding team contract.

## Prize-track fit

Prioritize the main autonomous-company demonstration and Monid's track if Monid performs meaningful research work in the live flow.
AgentMail is a second fit when the demo actually handles supplier communication and responses.
Evaluate Mobilerun only if a selected supplier requires a phone interaction that cannot be served adequately through the chosen API or browser path.
Invitation integrations remain optional.

## Sources checked

- [Naive SDK publications](https://www.npmjs.com/~usenaive-sdk)
- [Naive SDK and governed integrations example](https://usenaive.ai/blog/how-to-build-an-agentic-access-governance-platform)
- [Monid discovery, inspection, and execution](https://docs.monid.ai/)
- [AgentMail quickstart](https://www.agentmail.to/docs/quickstart)
- [AgentMail webhook handling](https://docs.agentmail.to/webhooks-overview)
- [Neon and Next.js integration](https://neon.com/docs/guides/nextjs)
- [Vercel request execution limits](https://vercel.com/docs/functions/limitations)
- [Stripe separate charges and transfers](https://docs.stripe.com/connect/separate-charges-and-transfers)

Documentation review does not establish team credentials, claimed sponsor credits, or a tested live supplier transaction.
