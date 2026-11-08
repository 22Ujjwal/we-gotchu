import { createHash, timingSafeEqual } from 'node:crypto'

// Static bearer check for POST /api/mcp. The token comes from Naive's vault and
// identifies Naive only; it never grants permission for an action by itself.

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** True only when MCP_BEARER_TOKEN is set and the header carries exactly that bearer token. */
export function isAuthorized(authorization: string | null, expected: string | undefined = process.env.MCP_BEARER_TOKEN): boolean {
  if (!expected) return false
  if (!authorization) return false
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim())
  if (!match) return false
  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(digest(match[1]), digest(expected))
}

export function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ errorCode: 'unauthorized', message: 'A valid bearer token is required.' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'www-authenticate': 'Bearer' },
  })
}
