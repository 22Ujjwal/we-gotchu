import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { bookedEvent } from '../../contracts'
import { receiptsFromView } from '../../lib/hostwell/receipts'
import { ReceiptPaper } from './receipt-papers'

test.each(['thermal', 'notepad', 'invoice', 'card'] as const)('%s paper keeps simulation evidence visible', style => {
  const data = receiptsFromView(bookedEvent)
  render(<ReceiptPaper receipt={{ ...data.receipts[0], style }} timezone={data.timezone} startsAt={data.startsAt} />)
  expect(screen.getByText('Simulated receipt. No real booking or purchase.')).toBeVisible()
})

test('card receipt identifies sandbox payment', () => {
  const data = receiptsFromView(bookedEvent)
  render(<ReceiptPaper receipt={{ ...data.receipts.at(-1)!, mode: 'test' }} timezone={data.timezone} startsAt={data.startsAt} />)
  expect(screen.getByText('Sandbox receipt. Test payment.')).toBeVisible()
})
