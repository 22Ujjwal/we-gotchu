# Venue images handoff

Branch: `feat/venue-images`, based on `5eafbcb`. Local only; not merged, pushed or deployed.

## Response contract

`GET /api/planning/:id/options/:optionId/images` uses the existing signed-in session.
The server loads the caller-owned conversation and resolves `optionId` in its saved
current proposal. It does not accept a URL parameter or call/poll the planning agent.

```ts
type VenueImagesResponse = {
  conversationId: string
  optionId: string
  version: number // saved PlanningView version at lookup
  status: 'available' | 'none' | 'unavailable'
  images: Array<{ // zero to four, ordered caption -> structured data -> metadata
    url: string
    sourcePage: string
    provider: 'source-page'
    attribution: { text: string; url: string }
    evidence: 'caption' | 'structured-data' | 'page-metadata'
    description: string | null
  }>
}
```

- `available`: one or more candidates survived identity, relevance and public-host checks.
- `none`: no suitable image, uncertain identity, or a non-venue option.
- `unavailable`: source fetch/parser/DNS deadline failure; no provider detail is exposed.
- 401 for no sign-in; 404 for missing/foreign conversation or missing option.
- `Cache-Control: private, no-store`; no persistent HTML/photo cache. The frontend
  may retain response state while the card is mounted, but should not persist it.

## Frontend integration (Tony/Leo)

Render the saved proposal immediately. Fetch photos independently per visible
venue card, with a small concurrency limit. Ignore responses belonging to another
conversation/option/version; abort or discard old requests after a proposal change.
Use a slider only when more than one image exists. On errors, empty arrays or image
load failure, retain the text card and source link. Render attribution as a source
link and description as text, never HTML. Consider `referrerPolicy="no-referrer"`
for external image loads. No frontend files have been edited in this branch.

Attribution identifies the source page; it is not a claim about the photographer
or a reuse license. Caption/metadata evidence does not prove that an image shows
an interior, the latest layout, availability, or a bookable room. No generated or
stock substitute is used. The browser downloads the image directly; this endpoint
does not proxy, persist, or validate image bytes. Hosting/redirect behavior may
change after retrieval; handle broken images independently.

## Configuration and limits

No new secret or environment variable is required. Existing Clerk authentication
and planning storage configuration (`DATABASE_URL`, or development-only
`PLANNING_LOCAL_DB_DIR`) still apply. New direct dependency: `parse5` for HTML parsing.

HTTPS only; no credentials in URLs, custom ports, or redirects. Public IPv4-only
DNS is checked and pinned to the server connection; private/special addresses and
IPv6 are rejected conservatively. Five-second HTML fetch deadline, 1.5MB HTML cap,
HTML content type, no compressed transfer, 5.5-second overall retrieval deadline.
Returned image hosts must also resolve only to public IPv4 addresses at retrieval.
No cache means no provider content is retained beyond handling the request.

This first increment uses the saved source page only. JS-rendered galleries,
redirecting pages, weak captions, and missing metadata may return no image.
Verified Place IDs and a places-provider fallback are not implemented: the saved
option schema currently supplies neither a dedicated Place ID nor structured
address. A fallback remains a separate optional increment requiring reliable place
matching, provider configuration and its attribution/cache rules. No proposal
schema, agent prompt, research, database schema, migration, payment, or booking changes.

## Verified venue example

On 2026-11-08, fetched The Pearl's official page using the production HTTPS reader
under both Node and Bun:
https://www.thepearlsf.com/brochures/pearl-brochure-rates

The endpoint module, with a local test-owned saved option and live source/DNS,
returned HTTP 200, `available`, and one image:
https://cdn.prod.website-files.com/6603ce63f223f72944af8872/6603ce63f223f72944af8949_ThePearl_BrightEventRentals.webp

Downloaded separately for visual verification: `image/webp`, 233468 bytes. Visually
confirmed rooftop seating under a tent, consistent with the source caption. Logos
and floor-plan/brochure graphics were excluded. This verifies live source retrieval,
not hosted sign-in, deployed routing or an implemented frontend slider.

Tests verify unauthorized/missing options never fetch, source deadlines/private
addresses/redirects/oversize/non-HTML are rejected, duplicates/caps are respected,
directory preview photos do not inherit nested venue identity, and failed/missing
images leave the stored usable proposal unchanged. No research sessions were run.

Final verification: 517 application tests, 25 coordination tests, typecheck and
Vercel build passed. Independent review passed after fixing the directory-preview
identity regression. No live purchases, messages or research sessions occurred.
