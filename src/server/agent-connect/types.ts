import type { PlanningView } from '../../agent/planning/contract'

export type AgentScope = 'arrange:read' | 'arrange:plan' | 'arrange:select'
/** Supplied only by the trusted token verifier, never by request JSON. */
export type AgentGrant = {
  grantId: string
  customerId: string
  clientId: string
  audience: string
  expiresAt: number
  revoked: boolean
  scopes: AgentScope[]
  /** null permits this customer's conversations; an array restricts to those IDs. */
  conversationIds: string[] | null
}
export type AgentActor = Pick<AgentGrant, 'customerId' | 'clientId' | 'grantId'>
export type StartInput = { requestId: string; message: string }
export type AgentCommand = { requestId: string; expectedVersion: number } & (
  | { kind: 'message'; message: string }
  | { kind: 'select'; optionId: string }
)
export interface AgentBackend {
  create(actor: AgentActor, input: StartInput): Promise<PlanningView>
  read(actor: AgentActor, conversationId: string): Promise<PlanningView>
  command(actor: AgentActor, conversationId: string, input: AgentCommand): Promise<PlanningView>
}
export type Admission = (input: {
  actor: AgentActor
  tool: string
  conversationId?: string
  /** Already namespaced; durable admission must account for retries idempotently. */
  requestId?: string
}) => Promise<void>
export type TokenVerifier = (token: string) => Promise<AgentGrant | null>

/** Public, sanitized errors only. Never wrap provider exception text in this type. */
export class GatewayError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message) }
}
