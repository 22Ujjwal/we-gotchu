# UI integration repair plan

Owner: Ujjwal. Working branch: integrate/agent-connect-tony, combining connector 09579d7 with Tony 8a06de3. User explicitly requested UI/backend integration repair, parallel agents and screenshot validation. Preserve Leo's visual identity and the existing customer approval boundaries.

Milestones:
1. Reconcile server contract tests and connected journey assertions against intended behavior. Keep explicit customer approval and named venue selection assertions.
2. Fix actual planning UI visibility/recovery defects; adapt stale selectors without removing safety or persistence coverage.
3. Capture and inspect real rendered components on desktop/mobile: loading, options, selections, inquiry/status/recovery. Controlled fixtures are visual evidence, not live provider evidence.
4. Review combined diff, run full application/tooling/typecheck/build and MCP checks; commit only after green. Preserve separate tested changes as atomic commits where the pending integration merge permits. No push/deployment or real supplier/payment actions.

Design: preserve existing colors, typography and venue-card/detail layouts. Make saved status, unknown costs, recovery actions and customer choices visible. Do not introduce a new design system or redesign the homepage.

Delegation: planning UI agent owns planning-chat, planning-arrangement and settings-view plus planning-chat tests; API agent owns planning HTTP/runtime tests and connected journey tests; visual agent owns ignored screenshot harness/evidence only. Root coordinates integration and final checks.

Screenshot-driven additions: connect the existing per-option images endpoint asynchronously (maximum four, retain attribution, safe missing-image fallback), and disable competing arrangement requests when an inquiry delivery already exists, matching the backend guard. Keep uncertain-send explanation next to recovery controls. These are integration repairs identified from actual desktop/mobile frames, not a visual redesign.
