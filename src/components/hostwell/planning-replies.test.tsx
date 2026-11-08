import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PlanningReplies } from './planning-replies'
import type { SupplierReply } from '../../agent/planning/reply-contract'

const reply: SupplierReply = { id: 'reply', status: 'ready', message: {
  provider: 'controlled', messageId: 'message', threadId: 'thread', inReplyTo: 'sent', from: 'venue@example.com', to: ['planner@example.com'],
  subject: 'Your event', text: 'Room hire is USD 200. Tax is extra.', receivedAt: '2026-11-08T10:00:00Z', originalRef: 'controlled:message', mode: 'simulated',
}, interpretation: { kind: 'quote', summary: 'The venue quoted room hire.', nextAction: 'Ask for the total including tax.',
  facts: [{ field: 'price', value: 'USD 200', quote: 'Room hire is USD 200.' }], missing: ['Tax amount', 'Date availability'] } }

test('shows quoted facts, missing costs, source message and simulation label without a booking claim', () => {
  render(<PlanningReplies replies={[reply]} stale={false} />)
  expect(screen.getByText('Controlled test reply')).toBeVisible()
  expect(screen.getByText('USD 200')).toBeVisible()
  expect(screen.getByText('Tax amount')).toBeVisible()
  expect(screen.getByText('Ask for the total including tax.')).toBeVisible()
  expect(screen.getByText('Room hire is USD 200. Tax is extra.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /pay|book/i })).not.toBeInTheDocument()
})

test('keeps an uninterpreted reply readable and marks replies to an old inquiry as out of date', () => {
  render(<PlanningReplies replies={[{ ...reply, status: 'failed', interpretation: undefined }]} stale />)
  expect(screen.getByText(/earlier venue or event details/)).toBeVisible()
  expect(screen.getByText(/saved this reply but could not interpret/)).toBeVisible()
  expect(screen.getByText('Room hire is USD 200. Tax is extra.')).toBeInTheDocument()
})
