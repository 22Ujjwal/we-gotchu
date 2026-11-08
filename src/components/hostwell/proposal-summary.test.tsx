import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ProposalSummary } from './proposal-summary'

test('long proposals retain the complete source wording behind Details and keep the next question visible', () => {
  const first = 'Garden room fits your group.'
  const summary = `${first} Availability remains unconfirmed, and the published estimate excludes any required staffing, delivery, setup or cleaning costs. We still need to confirm cancellation terms directly before treating this as a final quote, and your requested date may be unavailable.`
  render(<ProposalSummary summary={summary} nextQuestion="What time should dinner start?" />)
  expect(screen.getByText(first)).toBeVisible()
  expect(screen.getByText(summary)).not.toBeVisible()
  expect(screen.getByText('What time should dinner start?')).toBeVisible()
  fireEvent.click(screen.getByText('Details', { selector: 'summary' }))
  expect(screen.getByText(summary)).toBeVisible()
})

test('short proposals preserve uncertainty inline without an extra disclosure', () => {
  render(<ProposalSummary summary="Availability is not confirmed." nextQuestion={null} />)
  expect(screen.getByText('Availability is not confirmed.')).toBeVisible()
  expect(screen.queryByText('Details')).not.toBeInTheDocument()
})

test('sentence previews retain decimal amounts and time abbreviations', () => {
  const first = 'The estimate is $1.00 per guest for a 6 p.m. dinner.'
  const summary = `${first} Availability remains unconfirmed, and the published estimate excludes any required staffing, delivery, setup or cleaning costs. We still need to confirm cancellation terms directly before treating this as a final quote.`
  render(<ProposalSummary summary={summary} nextQuestion={null} />)
  expect(screen.getByText(first)).toBeVisible()
  fireEvent.click(screen.getByText('Details', { selector: 'summary' }))
  expect(screen.getByText(summary)).toBeVisible()
})

test('verbose questions show the first question and preserve the full explanation in Details', () => {
  const question = 'What time should the party end? I read 18:00–08:00 as an overnight event, but this may be a typo. Please confirm before we check availability.'
  render(<ProposalSummary summary="Garden room could fit." nextQuestion={question} />)
  expect(screen.getByText('What time should the party end?')).toBeVisible()
  expect(screen.getByText(question)).not.toBeVisible()
  fireEvent.click(screen.getByText('Details', { selector: 'summary' }))
  expect(screen.getByText(question)).toBeVisible()
})

test('long unbroken summaries have a bounded preview and expandable exact text', () => {
  const summary = 'Availability and final costs remain unconfirmed '.repeat(12).trim()
  render(<ProposalSummary summary={summary} nextQuestion="Please confirm the end time" />)
  const copies = screen.getAllByText(summary)
  expect(copies[0]).toHaveClass('line-clamp-2')
  expect(copies[1]).not.toBeVisible()
  expect(screen.getByText('Please confirm the end time')).toBeVisible()
  fireEvent.click(screen.getByText('Details', { selector: 'summary' }))
  expect(copies[1]).toBeVisible()
})
