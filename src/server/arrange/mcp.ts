import { z } from 'zod'
import { isAuthorized, unauthorizedResponse } from '../mcp/auth'
import { handleJsonRpc, toolResult, type ServerDescription, type ToolDefinition } from '../mcp/protocol'
import { LedgerRefusal } from './ledger'
import type { ArrangeApp } from './app'

// The agent's four tools. Each one parses its input and hands it to the app;
// the Event ledger decides whether it is allowed. A refusal comes back as a
// tool error with a code and a plain reason the agent can act on.

const SERVER: ServerDescription = {
  info: { name: 'arrange', version: '0.1.0' },
  instructions: 'ARRANGE event tools. Read the event with get_event before acting. Every email and every recorded fact is checked by the server; if a call is refused, read the reason and decide what to do instead.',
}

const id = z.string().min(1).max(200)

async function guarded(run: () => Promise<unknown>) {
  try {
    return toolResult(await run())
  } catch (error) {
    if (error instanceof LedgerRefusal) return toolResult({ refused: error.code, reason: error.message }, true)
    throw error
  }
}

export function createArrangeTools(app: Pick<ArrangeApp, 'ledger' | 'sendSupplierEmail'>): ToolDefinition<any>[] {
  const getEvent: ToolDefinition<{ eventId: string }> = {
    name: 'get_event',
    description: 'Read everything known about an event: the brief, supplier contacts, emails sent and received (with message ids), recorded terms, updates and the current stage.',
    input: z.object({ eventId: id }).strict(),
    handler: ({ eventId }) => guarded(async () => {
      const event = await app.ledger.readEvent(eventId)
      const { customerId: _customer, ...visible } = event
      return visible
    }),
  }
  const sendSupplierEmail: ToolDefinition<{ eventId: string; contactId: string; subject: string; body: string; operationKey: string }> = {
    name: 'send_supplier_email',
    description: 'Email a supplier contact on this event. Follow-ups stay in the same thread automatically. operationKey is a short name you choose for this email (for example "venue-first-inquiry"); reuse the same key only to retry the same email. Returns sent, rejected or unknown; never retry an unknown send with a new key.',
    input: z.object({
      eventId: id, contactId: id,
      subject: z.string().min(1).max(200).regex(/^[^\r\n]+$/),
      body: z.string().min(1).max(10_000),
      operationKey: z.string().regex(/^[A-Za-z0-9._:-]{1,80}$/),
    }).strict(),
    handler: (args) => guarded(() => app.sendSupplierEmail(args)),
  }
  const recordSupplierTerms: ToolDefinition<{ eventId: string; messageId: string; terms: { term: string; amountMinor?: number; currency?: string; note?: string; excerpt: string }[] }> = {
    name: 'record_supplier_terms',
    description: 'Record terms a supplier stated in one of their emails. Each term needs an excerpt copied exactly from that email. Money is a whole number in minor units (cents) with a 3-letter currency, for example 9200 and "EUR" for €92.',
    input: z.object({
      eventId: id, messageId: id,
      terms: z.array(z.object({
        term: z.string().min(1).max(64),
        amountMinor: z.number().optional(),
        currency: z.string().optional(),
        note: z.string().max(500).optional(),
        excerpt: z.string().min(1).max(1000),
      }).strict()).min(1).max(20),
    }).strict(),
    handler: ({ eventId, messageId, terms }) => guarded(() => app.ledger.recordSupplierTerms(eventId, messageId, terms)),
  }
  const postUpdate: ToolDefinition<{ eventId: string; text: string; kind: 'progress' | 'question_for_customer' }> = {
    name: 'post_update',
    description: 'Post a short, warm update the customer will read on their event page. Use kind "question_for_customer" when you need the customer to decide something.',
    input: z.object({ eventId: id, text: z.string().min(1).max(1000), kind: z.enum(['progress', 'question_for_customer']) }).strict(),
    handler: ({ eventId, text, kind }) => guarded(() => app.ledger.postUpdate(eventId, text, kind)),
  }
  return [getEvent, sendSupplierEmail, recordSupplierTerms, postUpdate]
}

const MAX_BODY_BYTES = 1_000_000

export async function handleArrangeMcp(request: Request, tools: readonly ToolDefinition<any>[], bearer: string | undefined): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'), bearer)) return unauthorizedResponse()
  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Request too large' } }, { status: 413 })
  const outcome = await handleJsonRpc(raw, tools, SERVER)
  if (outcome.kind === 'accepted') return new Response(null, { status: 202 })
  return Response.json(outcome.body, { status: outcome.status })
}
