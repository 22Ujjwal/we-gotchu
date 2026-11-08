# Venue images

Approved design: retrieve zero to four relevant photos independently after a saved planning proposal appears. Resolve venue options under conversation ownership; never accept a caller-supplied source URL. No changes to research, prompts, proposal schemas, payment, or frontend layout.

Approaches: official-page extraction is the first implementation (no new provider credential); a places-provider fallback is optional future work requiring verified matching, attribution, and provider-specific cache policy. Random search images are excluded. Prefer evidence tied to the venue's page; omit results when identity or relevance is uncertain. No promise that every image shows an interior.

Return option ID, conversation version, status, and images containing URL, source page, provider, attribution. Images load independently; failures return an empty image response. HTML requests are HTTPS-only, public IPv4 DNS pinned to the connection, no redirects, five-second budget, bounded bytes. No persistent source/image cache in this increment; private no-store response. URLs and content are untrusted. Never send provider credentials to clients.
