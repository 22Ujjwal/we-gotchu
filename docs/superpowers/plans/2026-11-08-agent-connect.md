# Agent connection implementation plan

> **For agentic workers:** Use executing-plans and test-driven-development, one milestone at a time.

**Goal:** A customer-scoped planning gateway callable over MCP and a JSON handler, isolated from internal execution and Tony's current integration.
**Architecture:** Strict tool schemas, request-bound verified grants, mandatory admission and existing planning-service bridge. The official MCP SDK lives in an isolated checked-JavaScript package; no root dependency or route changes.
**Tech stack:** Existing TypeScript/Zod/Vitest/PGlite; Node crypto; official MCP v2 server/client in a separately locked package.
**Spec:** `docs/superpowers/specs/2026-11-08-agent-connect-design.md`.

## Global constraints
- Customer approval/payment remains in Arrange; gateway cannot send mail, pay, approve exceptions or execute suppliers.
- No fetch of unpublished team changes, production config/deploy, provider calls or push.
- No edits to planning, frontend, internal MCP, root config/dependencies, schemas or migrations.
- Small verified Conventional Commits, no coauthor attribution.
- Keep auth/runtime/admission integration requirements explicit; fixtures never establish hosted readiness.

## Review focus
- Cross-customer/grant access and unsupported authority denied before backend calls (task 1).
- Provider/tool errors and hidden approval details never leak (task 1).
- Retry IDs and revision conflicts preserve existing idempotency, including toggles (task 2).
- Concurrent HTTP clients cannot inherit each other's identities (task 3).
- Body limits, Origin/Host validation, SDK protocol and token expiry are enforced on each request (task 3).

### Task 1: Core and scoped access
Files: new `src/server/agent-connect/{types,schemas,auth,gateway}.ts` and tests.
Interfaces: `createAgentGateway({backend,admit,appOrigin,audience,now})` creates an authenticated session with list/call operations; grant verified separately by `createHashedTokenVerifier({lookup})` and per-request gateway validation. Backend takes verified grant and typed create/read/command arguments.
- [ ] Write failing tests for unknown tool/extra args, customer isolation, expired/revoked/wrong-audience/restricted grants, scope enforcement, mandatory admission, stable request IDs, output allowlist and error redaction.
- [ ] Implement and run focused tests/typecheck; commit `feat(agent-connect): add customer-scoped planning gateway`.

### Task 2: Planning bridge
Files: `src/server/agent-connect/planning-bridge.ts` and tests.
Interface: `createPlanningBridge({repository,agent,...})` supplies the backend port using existing create/read/command service functions; identity bound from grant, no operator-review access.
- [ ] Test with isolated PGlite and fake provider: create/poll/refine/toggle, replay stability, changed payload conflict, stale versions and cross-customer rejection.
- [ ] Implement, run focused and full application tests/typecheck; commit `feat(agent-connect): reuse durable planning workflow`.

### Task 3: HTTP and official SDK adapter
Files: core `http.ts` plus tests; new `integrations/arrange-agent-connect/{package.json,bun.lock,tsconfig.json,mcp.mjs,mcp.test.mjs}`.
Interfaces: shared HTTP auth/body/origin guard; JSON tool handler; SDK factory builds fresh per-request tools with structured output and annotations.
- [ ] Test missing/expired token, wrong origin/host, oversized/stalled body, backend unavailability and output privacy.
- [ ] Use official MCP client in-process to discover tools, run fixture planning, check errors/replays and concurrent caller isolation. No listening server or external writes required.
- [ ] Install only isolated package dependencies; run its frozen install/typecheck/tests and root checks; commit `feat(agent-connect): expose MCP and JSON adapters`.

### Task 4: Handoff and final review
Files: package README, `docs/team/agent-connect.md`, Ujjwal-owned status file.
- [ ] Document tool schemas, config names, pilot-token issuance responsibilities, mandatory durable admission, customer handoff and compatibility limits; include reproducible client recipe without secrets.
- [ ] Independent fresh review, necessary regression/fix commit if warranted.
- [ ] Verify full app/coordination suites, typecheck, Vercel build, isolated SDK tests/typecheck and clean ownership diff.
- [ ] Commit documentation and report exact commits, implemented vs unverified boundaries. Keep branch local.

## Builder decisions
- SDK wrapper uses `.mjs` and separate `checkJs` configuration so root `**/*.ts` inclusion does not require installing its packages to run normal app CI.
- Reviewer found no important unanswered behavioral questions. Existing user direction authorizes autonomous implementation; optional authority question remains open, with plan/track + customer approval as stated default.
