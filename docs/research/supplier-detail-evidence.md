# Supplier detail evidence

Ticket02 adds optional detail investigation between validated discovery and ranking.
The branch is `feat/supplier-detail-evidence`, based on `14cab2e` and contract 0.4.
It changes only supplier adapters, the standalone research workflow, its smoke, and ticket-specific tests and documentation.
It does not change shared schemas, root dependencies, Naive lifecycle code, or application integration.

## Evidence rules

`createDetailEnricher` returns the optional `ResearchProviders.enrich` function.
Its inputs are `ResearchInput`, the validated `Discovery`, and an `AbortSignal`; its output is another `Discovery` with the same candidates and identities.
The workflow emits `investigating` before calling it and validates its result before ranking.
Callers that omit it retain discovery-only behavior.
Ticket05 can consume the same adapter through its own durable execution boundary; this in-process function does not supply persistence or crash recovery.

The adapter alternates venues and supplies in discovery order, selecting two candidates by default.
This is a bounded selection policy, not a claim that these are the best suppliers.
Each selected product gets one Channel3 detail request.
Each selected venue gets its source page and at most one linked informational page on the same hostname, allowing only a www prefix difference.
Allowed linked paths are about, packages, pricing, faq, and cancellation-policy.
The adapter never follows contact, checkout, arbitrary subdomains, or model-selected tool names.
Unselected candidates get a source check explaining the configured limit.

Product ID, offer URL path, and offer identity must match discovery before a retailer price can become listing evidence.
Channel3 offer IDs must match while tracking IDs may change; direct retailer query parameters must match exactly.
`priceEstimate` remains null because the application defines it as the total for the required quantity, which ticket03 must calculate.
The offer must have a supported currency matching the brief and an exact two-decimal minor-unit amount.
A changed merchant, conflicting offers, malformed price, or currency mismatch leaves the listing price unknown.
`priceProvenance` is `supplier_listing`, never `quote`.
`verification.listingPrice` identifies the merchant, amount in major and minor units, and currency, while final `price` verification remains unknown.
Affiliate disclosures from search and detail are retained.
Listing stock is an attributed observation and never establishes event-date availability or delivery.

A narrow, complete product feature such as "Includes 20 plates" is retained in `verification.packSize.note` with its API source.
Contradictory supported statements produce `conflict`.
Other wording remains unknown instead of relying on a broad quantity regex.
No `quantityInfo` is created because that contract field also requires needed units and packs, which belong to ticket03.
Ticket03 must not treat a product feature as a completed quantity calculation.

Venue keyword matches only select bounded excerpts for review.
They never establish numerical capacity, price, cancellation rights, or availability.
Each excerpt remains `unknown`, identifies its source URL, and says it is unverified supplier-page text.
Missing statements, failed responses, and checks that require further verification or supplier contact remain explicit.
No supplier contact occurs.
Successful sources include retrieval timestamps; failed attempts record their check time and provider run reference when available.

## Limits and safety

Defaults allow at most three detail creations, two venue pages and one product record.
Configuration permits one to six selected candidates and one or two pages per venue.
Each creation can have at most twenty status reads, a 25-second deadline by default, and a configured maximum deadline of 30 seconds.
The overall workflow retains its separate deadline.
There is no automatic retry of a creation whose outcome is uncertain.
A timed-out hosted run may continue remotely; its known run reference is recorded for reconciliation.
These read-only endpoints do not provision persistent supplier resources.

The detail transport rejects more than 256,000 response bytes while reading, before JSON parsing.
Page Markdown is limited to 40,000 characters, and each retained field excerpt is limited to 500 characters.
Product offers and key features are bounded at 100 entries each.
Context.dev is requested with zero cache age, and a response reporting more than 60 seconds of cache age is rejected.
The retrieved page URL and source URL must match the requested path and query, and returned final and canonical URLs must remain on the same site.
Only public-form HTTPS hostnames without credentials or nondefault ports are submitted.
The managed provider controls DNS resolution and redirect fetching; application checks do not prove network-level protection against DNS rebinding or an upstream redirect to a private address.
Off-site returned content is rejected rather than used as supplier evidence.

Provider bodies and exceptions never become customer-visible error strings.
Supplier content is untrusted data, and only fixed read-only endpoints can execute.
The ranking model still orders existing IDs and cannot author supplier facts or select supplier tools.

## Provider choice

[Channel3 product detail](https://docs.trychannel3.com/api-reference/v1/product-detail) provides structured product IDs, offers, and feature text for products already discovered through Channel3.
That avoids a separate merchant crawler and allows an explicit offer identity check.
Direct merchant APIs could provide stronger fulfillment or checkout evidence, but none has been authenticated or verified for these suppliers.
This slice uses the existing authenticated Monid path instead of introducing another account or dependency.

[Context.dev Markdown](https://docs.context.dev/api-reference/web-scraping/markdown) supplies bounded individual supplier pages through the inspected Monid endpoint.
Its current direct documentation redirects to a newer API shape; the implementation follows the inspected Monid schema and observed Monid output, not an assumed equivalence with the newer direct API.
Single-page requests make the page count and selected URLs explicit.

[Apify Website Content Crawler](https://apify.com/apify/website-content-crawler/input-schema) supports bounded crawling and Markdown output and is a plausible alternative when broader site coverage is needed.
It adds crawl configuration and run/dataset handling that this two-page slice does not need.
[Apify Google Maps Scraper](https://apify.com/compass/crawler-google-places) overlaps the existing discovery path and does not establish event-specific terms.
A [supplier-specific Peerspace Actor](https://apify.com/ahmed_jasarevic/peerspace-scraper/api) advertises rates and capacity, but only for Peerspace listings; the representative independent venue pages do not use that platform.
These Apify capabilities were evaluated from their published descriptions and schemas, not tested live.
No custom crawler was built.

Interactive browser tools are useful for investigating a difficult page, but this slice needs repeatable server-side bounded reads without user cookies or general browser actions.
No browser authentication flow, supplier portal, booking, or payment was tested.

## Verification

Controlled tests submit an event brief through `researchEvent` with the real discovery and detail adapters and controlled HTTP responses.
They cover listing-price enrichment, pack evidence, progress, attribution, merchant/product/currency mismatch, failed and absent details, conflicting packs, stale cache, page identity, oversized content, and hostile links and instructions.
They assert customer-visible candidates, recommendations, unknowns, and source checks.

The opt-in smoke in `src/agent/smoke.ts` requires successful detail sources for both a venue and supply candidate and a listing price, alongside recommendations and unknown final budget fit.
It uses a synthetic future San Francisco birthday brief and real discovery, detail, and Naive ranking.
Exact prices and search ordering are not stable test assertions.
Naive cleanup runs in a finally block, and checkpoints and optional result snapshots remain local.

The exact tracked baseline `14cab2e` fails typecheck because `src/routeTree.gen.ts` contains malformed merged declarations.
With the owner's narrow verification exception, the existing build command regenerated that file locally and build/typecheck passed.
The original tracked file is restored before feature commits.
The generated-only patch for Ujjwal is `/tmp/ticket02-generated-routes.patch`, with original and generated copies at `/tmp/ticket02-routeTree.original.ts` and `/tmp/ticket02-routeTree.generated.ts`.
A pass after regeneration is not a clean-checkout typecheck pass.

## Observed provider behavior

The authenticated Monid schemas were inspected before implementation using CLI 0.1.9.
Both selected endpoints use the existing Monid API key; no direct supplier credential was required.
Channel3 run `01M6WGTKD2XQD0A0G5RVX0DHRN` completed with HTTP200 in approximately 1.1 seconds of provider execution and reported a zero-dollar cost.
It returned product `tUK4Ec1`, a matching offer, USD price 11.02, InStock listing status, a 20-plate feature statement, and an affiliate disclosure.
It did not establish event-date fulfillment, taxes, delivery, or cancellation.
Context.dev run `01M6WGTA1FDG13P34HW94X2X1Q` completed with HTTP200 in approximately 4.4 seconds of provider execution and reported USD0.002.
The Marigold homepage redirected to its www hostname; the selected about page also returned content.
Neither page established date-specific availability, final event cost, or cancellation terms.
The controlled tests, rather than these successful provider runs, establish behavior for malformed content, failed retrieval, stale cache, oversized responses, and identity mismatch.

A smoke at `6f1e969` retrieved details but failed before Naive recorded an agent or session identity.
Read-only agent-list reconciliation first returned HTTP429, then returned HTTP200 with no more pages and no matching definition.
No creation was automatically retried and no unknown resource was deleted.
A subsequent complete smoke at `2149c2b` returned six candidates and six recommendations after one correction and reported no cleanup errors.
Final review then corrected the quantity-total semantics in `6ceb165`: pack prices remain in listing evidence and the total priceEstimate stays null.
The final smoke evidence below uses that correction.

Final implementation smoke at `6ceb165` on 2026-11-07 America/Los_Angeles passed with run `smoke-113d43b3-a4eb-4880-bdb2-8ec141aa8243`.
It returned six candidates and six recommendations without correction, with `partial` outcome and `unknown` budget fit.
All candidate total priceEstimate values remained null; the selected product retained sourced listing price and pack evidence.
Two discovery calls and three detail calls completed successfully.
Detail run references were `01M6WGXF0N55JJ737J98CMBCAX`, `01M6WGXMDEDH9BQ3QHXSXREGQC`, and `01M6WGXSC794T6YZFZ3PZFSBK3`.
Naive cleanup reported no errors after cancellation and deletion of the evaluation definition.
Local evidence is `/tmp/we-gotchu-ticket02-final-result.json`, `/tmp/we-gotchu-ticket02-final-checkpoint.json`, and `/tmp/ticket02-price-final-live.log`.
Private raw snapshots are not committed.

The final implementation's controlled suite has 151 tests, including 16 detail cases.
Full-app integration, crash recovery, bookability, payment, supplier contact, and exact event terms remain unverified.
An overall research interruption may return discovery evidence before an in-flight detail result is accepted; per-call detail failures are recorded when enrichment finishes.
