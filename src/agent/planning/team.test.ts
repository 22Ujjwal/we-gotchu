import { expect, test } from 'vitest'
import { coordinatorDefinition, specialistDefinition } from './team'

test('the event lead has a pinned roster and delegates without changing transaction access', () => {
  const definition = coordinatorDefinition('model', [ { id: 'maya', version: 2 }, { id: 'sam', version: 3 } ])
  expect(definition.multiagent).toEqual({ type: 'coordinator', agents: [ { type: 'agent', id: 'maya', version: 2 }, { type: 'agent', id: 'sam', version: 3 } ], board: false })
  expect(definition.handoffs).toBe('team')
  expect(definition.tools?.configs?.send_to_agent.permission).toBe('allow')
  expect(definition.tools?.configs?.wait_for_agents.permission).toBe('allow')
  expect(definition.mcp_servers).toEqual([])
  expect(definition.tools?.default_config?.permission).toBe('deny')
})

test('specialists can research but cannot spawn another team or inherit customer selection authority', () => {
  for (const role of ['venue', 'supply'] as const) {
    const definition = specialistDefinition(role, 'model')
    expect(definition.handoffs).toBe(false)
    expect(definition.multiagent).toBeNull()
    expect(definition.tools?.configs?.['monid.monid_run'].permission).toBe('allow')
    expect(definition.structured_output_required).toBe(true)
    expect(definition.output_schema?.properties).not.toHaveProperty('selectedOptionId')
  }
})
