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
    expect(definition.mcp_servers).toEqual([])
    expect(Object.keys(definition.tools?.configs ?? {}).sort()).toEqual(['data_describe', 'data_run', 'data_search', 'web_fetch', 'web_search'])
    for (const config of Object.values(definition.tools?.configs ?? {})) expect(config.permission).toBe('allow')
    expect(definition.system).toContain('Use native public research tools')
    expect(definition.system).not.toContain('Use Monid directly')
    expect(definition.structured_output_required).toBe(true)
    expect(definition.output_schema?.properties).not.toHaveProperty('selectedOptionId')
  }
})
