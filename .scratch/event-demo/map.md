# Prepare the event-demo team handoff

Label: wayfinder:map
Status: draft handoff complete; human decisions open

## Destination

Prepare reviewable draft architecture, integration contracts, and separate handoffs for one pitch owner, one frontend developer, and two backend developers.
Stop at documentation ready to share; do not implement the application.

## Notes

Use the agreed scope in docs/adr and vocabulary in GLOSSARY.md.
Use grilling and domain-modeling for human decisions and research for external facts.
The tracker is local Markdown, as no tracker has been configured.
Research is performed in isolated research branches; those branches are evidence and are not merged.
Implementation proposals remain drafts until the team approves them.
Time is not a planning constraint.
The service is free, three options are a demo example rather than a product limit, and the Naive SDK and OpenAI credits must both be evaluated.

## Decisions so far

- [Verify Naive SDK and OpenAI credit compatibility](issues/01-naive-openai.md): research complete, with Naive-funded hosted pi proposed and OpenAI BYOK unverified.
- [Verify supplier booking and payment feasibility](issues/02-supplier-payments.md): research complete, with separate customer collection and supplier funding required.

## Not yet specified

Exact package versions will be selected when implementation begins.
Supplier selection, funding, and refund timing are now explicit review items in the transaction decision.
The [team handoff](../../docs/team/README.md) contains draft contracts and four role briefs.
The requested documentation finish condition is met; human decision tickets stay open for team review.

## Out of scope

Application implementation, live bookings, charges, invitations, deployments, and merging research branches are outside this documentation effort.
Negotiation and invitation management remain optional future extensions.
Long-term monetization and market validation are outside this map.
