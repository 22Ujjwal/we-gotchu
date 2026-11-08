import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ProposalSummary } from './proposal-summary'

test('long proposals omit the detailed recap and keep the next question visible', () => {
  const first = 'Garden room fits your group.'
  const summary = `${first} Availability remains unconfirmed, and the published estimate excludes any required staffing, delivery, setup or cleaning costs. We still need to confirm cancellation terms directly before treating this as a final quote, and your requested date may be unavailable.`
  render(<ProposalSummary summary={summary} nextQuestion="What time should dinner start?" />)
  expect(screen.getByText(first)).toBeVisible()
  expect(screen.queryByText(summary)).not.toBeInTheDocument()
  expect(screen.getByText('What time should dinner start?')).toBeVisible()
  expect(screen.queryByText('Details')).not.toBeInTheDocument()
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
  expect(screen.queryByText('Details')).not.toBeInTheDocument()
})

test('verbose questions show only the first question', () => {
  const question = 'What time should the party end? I read 18:00–08:00 as an overnight event, but this may be a typo. Please confirm before we check availability.'
  render(<ProposalSummary summary="Garden room could fit." nextQuestion={question} />)
  expect(screen.getByText('What time should the party end?')).toBeVisible()
  expect(screen.queryByText(question)).not.toBeInTheDocument()
  expect(screen.queryByText('Details')).not.toBeInTheDocument()
})

test('long unbroken summaries have one bounded preview without details', () => {
  const summary = 'Availability and final costs remain unconfirmed '.repeat(12).trim()
  render(<ProposalSummary summary={summary} nextQuestion="Please confirm the end time" />)
  const copies = screen.getAllByText(summary)
  expect(copies[0]).toHaveClass('line-clamp-2')
  expect(copies).toHaveLength(1)
  expect(screen.getByText('Please confirm the end time')).toBeVisible()
  expect(screen.queryByText('Details')).not.toBeInTheDocument()
})


test('revised proposals replace the recap with a script update label', () => {
  const summary = 'Replaced the earlier venue for comparison only.'
  render(<ProposalSummary updated summary={summary} nextQuestion="What time should the party end?" />)
  expect(screen.getByText('Updated event')).toHaveClass('font-script')
  expect(screen.queryByText(summary)).not.toBeInTheDocument()
  expect(screen.getByText('What time should the party end?')).toBeVisible()
})
