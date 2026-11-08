import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ReceiptLoader } from './receipt-loader'

test('incomplete saved briefs can show live research without missing-field crashes', () => {
  render(<ReceiptLoader brief={{ occasion: 'Birthday dinner' }} activity="Checking room capacity." />)
  expect(screen.getByRole('status')).toHaveTextContent('Checking room capacity.')
  expect(screen.getByText('Birthday dinner')).toBeInTheDocument()
})
