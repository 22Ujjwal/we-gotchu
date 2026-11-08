import { createHash } from 'node:crypto'
import { z } from 'zod'
import { GatewayError } from './types'
import type { AgentGrant, TokenVerifier } from './types'

const grantSchema = z.object({
  grantId: z.string().min(1).max(256), customerId: z.string().min(1).max(256), clientId: z.string().min(1).max(256),
  audience: z.url(), expiresAt: z.number().int().positive(), revoked: z.boolean(),
  scopes: z.array(z.enum(['arrange:read', 'arrange:plan', 'arrange:select'])).min(1).max(3),
  conversationIds: z.array(z.string().min(1).max(256)).max(500).nullable(),
})
export function assertGrant(value: AgentGrant, audience: string, now: number): AgentGrant {
  const grant = grantSchema.safeParse(value)
  if (!grant.success || !Number.isFinite(now) || grant.data.audience !== audience || grant.data.revoked || grant.data.expiresAt <= now) {
    throw new GatewayError(401, 'invalid_token', 'Reconnect your Arrange account; this access grant is invalid or expired.')
  }
  return grant.data
}
export const tokenDigest = (token: string) => createHash('sha256').update(token).digest('hex')

/** Controlled pilot token lookup, NOT OAuth enrollment. Store only token digests.
 * The issuer must bind each record to the authenticated customer's approved grant.
 * Lookup happens each request so a durable registry can enforce revocation immediately. */
export function createHashedTokenVerifier(opts: { lookup(digest: string): Promise<AgentGrant | null> }): TokenVerifier {
  return async token => {
    if (token.length < 32 || token.length > 4096 || /\s/.test(token)) return null
    return opts.lookup(tokenDigest(token))
  }
}
