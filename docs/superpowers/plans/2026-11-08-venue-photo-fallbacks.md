# Venue photo fallbacks implementation plan

**Goal:** Keep venue cards and detail pages visually usable when source photos fail.
**Architecture:** Existing independent source fetch stays authoritative. After its first completed attempt, a stable ordered local photo pool supplies labeled interior inspiration. Real photos replace fallbacks whenever available. Asset errors advance within the gallery; no research, mail or payment behavior changes.
**Tech stack:** Existing React/TypeScript components, static JPEG assets, Vitest.

User authorized implementation and push/PR. No extra approval gate. Use the existing isolated worktree, with a separate feature branch stacked on the tested Leo integration.

- [x] Download and visually inspect 20 indoor photographs. Record original page, author, license and thumbnail transformation; provide public credits.
- [x] Test initial fetch, first failure/empty result, real-image precedence, failed image assets, carousel ordering and selection/reload behavior.
- [x] Add a stable per-venue ordered fallback gallery with a concise explicit label and credits link. Preserve Leo layout.
- [ ] Run focused tests, typecheck/build and local browser verification. Commit tested increments.
- [ ] Push tested integration and fallback branches; open reviewable draft PRs without merging. Document live research limits separately.

Alternatives: external stock URLs retain another network dependency; generic photos presented as venue photos misrepresent the location. Local licensed inspiration photos avoid both issues. Source matching remains conservative; no redirects or identity checks are weakened.

Verification: 108 focused tests, typecheck and production build pass. Independent review found premature fallback during a delayed successful response body; a failing regression test reproduced it and the fix waits for body parsing. Final browser verification was attempted but blocked by Chrome window loss (cgWindowNotFound). No final visual pass is claimed.

Source probe: canonical El Lopo pages are reachable, but the conservative identity matcher does not accept the decorated option name. No source validation was weakened. A missing/failed photo remains independent of research and is covered by labeled local inspiration.
