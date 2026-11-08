import { expect, test } from 'vitest'
import { researchActivity } from './activity'

test('reports parked and running teammates from provider state without invented progress', () => {
  expect(researchActivity([
    { id: 'lead', status: 'idle', stop_reason: 'awaiting_delegation' },
    { id: 'supplies', status: 'idle', stop_reason: 'awaiting_approval', pending_actions: [{}] },
    { id: 'venue', status: 'running', stop_reason: null },
  ], [{ type: 'thread.created', data: { thread_id: 'supplies', member: 'Sam (Supplies researcher)' } },
    { type: 'thread.created', data: { thread_id: 'venue', member: 'Maya (Venue researcher)' } }]))
    .toEqual([
      { name: 'Event lead', status: 'waiting', detail: 'Waiting for research teammates.' },
      { name: 'Sam (Supplies researcher)', status: 'blocked', detail: 'Paused for an internal research review.' },
      { name: 'Maya (Venue researcher)', status: 'working', detail: 'Working on options.' },
    ])
})
test('an idle teammate is not reported as successful without a result', () => {
  expect(researchActivity([{ id: 'lead', status: 'idle', stop_reason: 'end_turn' }], [])[0].status).toBe('waiting')
  expect(researchActivity([{ id: 'lead', status: 'completed', stop_reason: 'end_turn', structured_output: {} }], [])[0].status).toBe('done')
})
