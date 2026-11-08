# Supplier mail transport implementation plan

> **For agentic workers:** Use executing-plans, with test-driven-development, one milestone at a time.

**Goal:** Send the exact approved inquiry once and durably receive attributable replies independently of the customer browser.
**Architecture:** An isolated transport consumes injected AgentMail and durable repository adapters. Tony supplies persistence, approval, correlation/application handling and runtime composition; no in-memory production fallback. Webhook handling awaits durable receipt and application acknowledgement.
**Tech Stack:** TypeScript, existing agentmail SDK, Node crypto, Vitest.
**Spec:** `origin/docs/stage3-venue-inquiry-tickets` at `00be7e0`, `docs/handoffs/remaining-stages/{interfaces,ujjwal-mail,verification}.md`.

## Global constraints
- Own only this module and the proposed supplier-mail webhook; no shared schemas, migrations, dependencies, route tree, planner/UI, payment or customer notification edits.
- No push, production configuration changes, real supplier outreach, bookings or charges.
- Real send/reply requires an explicitly approved controlled recipient. Local fixtures are not live evidence.
- Persist intent before provider write. Timeout remains uncertain; never automatically resend.
- Acceptance is not delivery. Preserve original inbound evidence; supplier text is untrusted data.

## Review focus
- Concurrent/restarted sends and lost responses must not create a second message (task 1).
- Storage failures must not acknowledge lost evidence or permit an automatic resend (tasks 1/2).
- Invalid/replayed signatures and oversized bodies must not reach application handling (task 2).
- Duplicate callbacks after crash need a stable idempotency identity, including different event IDs for one message (task 2).
- Unrelated/ambiguous replies must remain unmatched, not become quotes (task 2).

## Task 1: Outbound adapter
Files: `types.ts`, `transport.ts`, `agentmail.ts`, `transport.test.ts`, `agentmail.test.ts`.
Interfaces: `createSupplierInquiryTransport({provider,operations})` exposes `sendInquiry(input)` and read-only `reconcileInquiry(operationId)`; `createAgentMailProvider({apiKey,inboxId})` implements provider port.
- [x] Write tests: exact payload/references; intent saved before send; same ID same payload no resend; changed payload conflict; concurrent calls; timeout uncertain; storage failure; clear rejection; read-only reconciliation.
- [x] Run focused tests red, implement, run focused tests plus typecheck and application suite green.
- [x] Commit `feat(email): add recoverable supplier inquiry sending`.

## Task 2: Inbound webhook
Files: `webhook.ts`, `incoming.ts`, `incoming.test.ts`, `webhook.test.ts`.
Interfaces: signed raw HTTP handler factory, normalized reply, durable receipt repository and idempotent application callback. Correlation helper checks exact provider refs and approved sender; no subject matching.
- [x] Write tests: published Svix test vector; invalid/stale signature; malformed/oversized payload; duplicate event/message; callback/storage failure retries; wrong inbox; missing body fetched using SDK IDs; unrelated sender and ambiguous thread unmatched.
- [x] Run red, implement, run focused tests, full suite and typecheck green.
- [x] Commit `feat(email): receive signed supplier replies durably`.

## Task 3: Handoff and final verification
Files: `README.md`, `HANDOFF.md`, route integration template within this owned module if shared runtime is unavailable.
- [x] Document exact interfaces, atomic storage requirements, callback idempotency, route/configuration, provider limits and recovery.
- [x] Record live-test blockers: controlled recipient approval, webhook secret and durable runtime are still pending; no send performed.
- [x] Independent final review; fix important findings with regression tests.
- [x] Full test, coordination checks, typecheck and Vercel build; verify no changes outside ownership.
- [x] Commit handoff. Report commits and evidence; do not push.

## Decisions
- Keep route wiring as an integration template until Tony provides durable runtime and generates route types. Registering an unconfigured endpoint would misrepresent hosted readiness.
- Application callback must atomically deduplicate/enqueue by stable receipt ID; a callback effect and transport completion cannot be made exactly once across separate transactions.
