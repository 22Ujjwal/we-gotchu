import { createClient } from '@usenaive-sdk/managed-agents'

// The two Naïve calls the app makes. Both carry an idempotency key, so a retry
// after a lost response never creates a second session or a second message.
export interface NaiveSessions {
  startSession(input: { eventId: string; message: string }): Promise<{ sessionId: string }>
  deliver(input: { sessionId: string; message: string; idempotencyKey: string }): Promise<void>
}

export function createNaiveSessions(opts: { apiKey: string; agentId: string; budgetMicroUsd?: number; fetch?: typeof fetch }): NaiveSessions {
  const client = createClient({ apiKey: opts.apiKey, ...(opts.fetch ? { fetch: opts.fetch } : {}) })
  return {
    async startSession({ eventId, message }) {
      const session = await client.sessions.create({
        agent_id: opts.agentId,
        message,
        budget_micro_usd: opts.budgetMicroUsd ?? 2_000_000,
        metadata: { event_id: eventId },
      }, { idempotencyKey: `event:${eventId}` })
      return { sessionId: session.id }
    },
    async deliver({ sessionId, message, idempotencyKey }) {
      // queue: an idle session starts a turn; a running one takes it as its next input.
      await client.sessions.send(sessionId, { message, queue: true }, { idempotencyKey })
    },
  }
}
