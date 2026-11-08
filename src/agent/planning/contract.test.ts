import { describe, expect, it } from 'vitest'
import { planningProposalSchema, planningCommandSchema } from './contract'

describe('planning boundary', () => {
  it('keeps customer selection outside the generated proposal and requires public links', () => {
    const option = { id: 'venue-1', kind: 'venue', name: 'A venue', url: 'https://example.com', why: 'Near the requested area', facts: [{ label: 'Published rate', value: '$100/hour', sourceUrl: 'https://example.com/rates', quote: '$100/hour', basis: 'published' }], unknowns: ['Date availability'] }
    const proposal = { summary: 'One option worth comparing.', options: [option], nextQuestion: null }
    expect(planningProposalSchema.parse(proposal)).toEqual(proposal)
    expect(planningProposalSchema.safeParse({ ...proposal, selectedOptionId: option.id }).success).toBe(false)
    expect(planningProposalSchema.safeParse({ ...proposal, options: [{ ...option, url: 'javascript:alert(1)' }] }).success).toBe(false)
    expect(planningProposalSchema.safeParse({ ...proposal, options: [option, option] }).success).toBe(false)
  })
  it('requires a revision and stable request identity for selection and follow-ups', () => {
    expect(planningCommandSchema.safeParse({ kind: 'message', requestId: 'request-1', expectedVersion: 2, message: 'Keep that venue, cheaper plates please.' }).success).toBe(true)
    expect(planningCommandSchema.safeParse({ kind: 'select', requestId: 'request-2', expectedVersion: 2, optionId: 'venue-1' }).success).toBe(true)
    expect(planningCommandSchema.safeParse({ kind: 'select', optionId: 'venue-1' }).success).toBe(false)
  })
})
