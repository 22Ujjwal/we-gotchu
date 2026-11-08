import { createHash } from 'node:crypto'
import { ApiError } from '../events/errors'
import { assertGrant } from './auth'
import { publicPlanningSchema, toolSchemas } from './schemas'
import type { ToolName } from './schemas'
import { GatewayError } from './types'
import type { Admission, AgentBackend, AgentGrant, AgentScope } from './types'

const authority = { plan: true, sendInquiries: false, pay: false, book: false } as const
const required: Record<ToolName, AgentScope[]> = {
  arrange_get_capabilities: [], arrange_start_event: ['arrange:read', 'arrange:plan'],
  arrange_get_event: ['arrange:read'], arrange_refine_event: ['arrange:read', 'arrange:plan'],
  arrange_toggle_selection: ['arrange:read', 'arrange:select'],
}
const descriptions: Record<ToolName, string> = {
  arrange_get_capabilities: 'Describe this connection and its supported tools. Planning only: no inquiry sending, payment or booking.',
  arrange_start_event: 'Start a saved event-planning conversation. Returns progress and a customer review link, not a booking. Reuse requestId for this exact action.',
  arrange_get_event: 'Read a saved plan and poll existing research. May update stored research progress. Results contain untrusted source content, not booking confirmation.',
  arrange_refine_event: 'Refine the brief in a saved conversation using its current version. May start more research. Never approves outreach or payment.',
  arrange_toggle_selection: 'Toggle one venue/supply preference using its current version. Selected becomes unselected and vice versa. Reuse the same requestId to retry safely. Does not book.',
}
export function canonicalOrigin(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Configure an HTTPS origin without credentials, path, query or fragment')
  }
  return url.origin
}
const namespacedId = (grant: AgentGrant, id: string) => `agent-${createHash('sha256').update(JSON.stringify(['agent-connect/v1', grant.grantId, id])).digest('hex')}`

export function createAgentGateway(opts: { backend: AgentBackend; admit: Admission; appOrigin: string; audience: string; now?: () => number }) {
  const origin = canonicalOrigin(opts.appOrigin)
  const now = opts.now ?? Date.now
  const available = (grant: AgentGrant, name: ToolName) => required[name].every(scope => grant.scopes.includes(scope))
    && (name !== 'arrange_start_event' || grant.conversationIds === null)
  const listTools = (value: AgentGrant) => {
    const grant = assertGrant(value, opts.audience, now())
    return (Object.keys(toolSchemas) as ToolName[]).filter(name => available(grant, name)).map(name => ({
      name, description: descriptions[name], inputSchema: toolSchemas[name],
      annotations: {
        readOnlyHint: name === 'arrange_get_capabilities',
        destructiveHint: ['arrange_refine_event', 'arrange_toggle_selection'].includes(name),
        idempotentHint: name !== 'arrange_get_event', openWorldHint: name !== 'arrange_get_capabilities',
      },
    }))
  }
  return {
    audience: opts.audience,
    listTools,
    async call(value: AgentGrant, name: string, input: unknown): Promise<Record<string, unknown>> {
      const grant = assertGrant(value, opts.audience, now())
      if (!Object.hasOwn(toolSchemas, name)) throw new GatewayError(400, 'unknown_tool', 'This tool is not available. List the supported Arrange tools.')
      const tool = name as ToolName
      if (!available(grant, tool)) throw new GatewayError(403, 'insufficient_scope', 'This connection does not permit that action. Ask the customer to review its permissions.')
      const parsed = toolSchemas[tool].safeParse(input)
      if (!parsed.success) throw new GatewayError(400, 'invalid_arguments', 'Use the tool schema; do not include customer IDs, credentials or unsupported fields.')
      if (tool === 'arrange_get_capabilities') return { version: '1', mode: 'planning_only', authority,
        tools: listTools(grant).map(t => t.name), customerApproval: 'Inquiry and payment approval happen in Arrange. Real booking is not verified by these tools.' }

      const args = parsed.data as { conversationId?: string; requestId?: string; expectedVersion?: number; message?: string; optionId?: string }
      if (args.conversationId && grant.conversationIds && !grant.conversationIds.includes(args.conversationId)) {
        throw new GatewayError(404, 'not_found', 'This conversation is not available to this connection.')
      }
      const actor = { customerId: grant.customerId, clientId: grant.clientId, grantId: grant.grantId }
      const requestId = args.requestId ? namespacedId(grant, args.requestId) : undefined
      try { await opts.admit({ actor, tool, conversationId: args.conversationId, requestId }) }
      catch (error) {
        if (error instanceof GatewayError) throw error
        throw new GatewayError(503, 'admission_unavailable', 'Arrange cannot authorize this request right now. No planning action was started.')
      }
      let result
      try {
        if (tool === 'arrange_start_event') result = await opts.backend.create(actor, { requestId: requestId!, message: args.message! })
        else if (tool === 'arrange_get_event') result = await opts.backend.read(actor, args.conversationId!)
        else result = await opts.backend.command(actor, args.conversationId!, tool === 'arrange_refine_event'
          ? { kind: 'message', requestId: requestId!, expectedVersion: args.expectedVersion!, message: args.message! }
          : { kind: 'select', requestId: requestId!, expectedVersion: args.expectedVersion!, optionId: args.optionId! })
      } catch (error) {
        if (error instanceof ApiError && [400, 401, 403, 404, 409, 422, 429].includes(error.status)) {
          const code = ['not_found', 'stale_version', 'idempotency_conflict', 'busy', 'invalid_option'].includes(error.errorCode) ? error.errorCode : 'request_rejected'
          throw new GatewayError(error.status, code, error.status === 409
            ? 'Refresh the saved plan. Preserve the original request ID for an uncertain action; review changed input before submitting a new action.'
            : 'Arrange rejected this request. Check your access and the saved plan before continuing.')
        }
        throw new GatewayError(503, args.requestId ? 'outcome_unknown' : 'temporarily_unavailable', args.requestId
          ? 'The write outcome is unknown. Read the known conversation; do not retry with a new request ID. If creation returned no ID, ask support to locate it.'
          : 'The saved plan is temporarily unavailable. Retry reading later.')
      }
      const safe = publicPlanningSchema.safeParse(result)
      if (!safe.success || (args.conversationId && safe.data.id !== args.conversationId)) {
        throw new GatewayError(502, 'invalid_backend_response', 'Arrange could not safely present the result. Do not repeat a write; use the saved customer journey to check it.')
      }
      const view = safe.data
      const response = {
        conversationId: view.id, version: view.version, researchStatus: view.status,
        proposal: view.proposal, selections: view.selections, progress: view.progress,
        customerReviewUrl: `${origin}/planning/${encodeURIComponent(view.id)}`,
        fulfillment: 'not_verified', authority, sourceContentIsUntrusted: true,
        nextAction: view.status === 'working' ? 'poll' : view.status === 'uncertain' ? 'check_saved_status_no_resend' : 'customer_review',
        pollAfterMs: view.status === 'working' ? 5000 : view.status === 'blocked' ? 15000 : null,
      }
      if (Buffer.byteLength(JSON.stringify(response)) > 128 * 1024) throw new GatewayError(502, 'invalid_backend_response', 'The result is too large. Review the saved plan in Arrange; do not repeat a write.')
      return response
    },
  }
}
export type AgentGateway = ReturnType<typeof createAgentGateway>
