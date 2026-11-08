# Research evidence

Both reports reviewed primary documentation on November 7, 2026.
Neither report tested private account access or real transactions.
Research branches are evidence and are not merged into the application branch.

- [Naive and OpenAI compatibility](https://github.com/22Ujjwal/we-gotchu/blob/f79fc9a8162a5b28d9fc659a127f74c195563f57/docs/research/naive-openai.md) recommends evaluating managed-agents with hosted pi, external MCP tools, call-scoped approval, and resumable progress.
- [Supplier payment feasibility](https://github.com/22Ujjwal/we-gotchu/blob/3909d64fea0af8470c9c5ffba09f5d9f7801ae88/docs/research/supplier-payments.md) recommends Stripe customer collection and an independently funded supplier card, conditional on eligibility and supplier verification.

Naive-hosted model usage consumes Naive credits.
OpenAI BYOK through Naive remains undocumented, so direct OpenAI credits are an optional separate path rather than a prerequisite.
Naive's detailed card and wallet documentation marks those capabilities unavailable.
The proposed architecture does not depend on them.

See the reports for primary-source links, conflicting documentation, alternatives, and account-dependent checks.
