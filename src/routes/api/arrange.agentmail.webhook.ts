import { createFileRoute } from '@tanstack/react-router'
import { getArrangeApp } from '#/server/arrange/runtime'
import { handle } from '#/server/events/errors'

// AgentMail delivers supplier replies here; authenticity comes from the Svix signature.
export const Route = createFileRoute('/api/arrange/agentmail/webhook')({
  server: {
    handlers: {
      POST: ({ request }) => handle(async () => (await getArrangeApp()).handleAgentMailWebhook(request)),
    },
  },
})
