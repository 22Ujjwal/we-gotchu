import { AgentMailClient, AgentMailError } from 'agentmail'
import { SendRejected } from './types'
import type { MailProvider } from './types'

/** Server only. Credentials must never cross the application response boundary. */
export function createAgentMailProvider(opts: { apiKey: string; inboxId: string; fetch?: typeof fetch }): MailProvider {
  const client = new AgentMailClient({ apiKey: opts.apiKey, fetch: opts.fetch, maxRetries: 0, timeoutInSeconds: 10 })
  const requestOptions = { maxRetries: 0, timeoutInSeconds: 10 }
  return {
    inboxId: opts.inboxId,
    async send(input, idempotencyKey) {
      try {
        const { replyToMessageId, ...message } = input
        if (replyToMessageId) {
          // AgentMail owns threading. Override recipients so quoted email cannot redirect the reply.
          return await client.inboxes.messages.reply(opts.inboxId, replyToMessageId,
            { to: message.to, cc: [], bcc: [], replyAll: false, text: message.text },
            { ...requestOptions, idempotencyKey })
        }
        return await client.inboxes.messages.send(opts.inboxId, message, { ...requestOptions, idempotencyKey })
      } catch (error) {
        // Conflict and server/network errors can conceal a previous acceptance.
        if (error instanceof AgentMailError && error.statusCode && [400, 401, 403, 404, 422, 429].includes(error.statusCode)) {
          throw new SendRejected(`provider_${error.statusCode}`)
        }
        throw new Error('Provider send outcome is unknown')
      }
    },
    async getMessage(messageId) {
      const message = await client.inboxes.messages.get(opts.inboxId, messageId, requestOptions)
      return {
        inboxId: message.inboxId, messageId: message.messageId, threadId: message.threadId,
        from: message.from, to: message.to, cc: message.cc,
        subject: message.subject, text: message.text,
        inReplyTo: message.inReplyTo, references: message.references,
        timestamp: message.timestamp.toISOString(),
      }
    },
  }
}
