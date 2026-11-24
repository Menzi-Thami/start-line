import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PhoneRunGuide } from './PhoneRunGuide'

it('explains the day-detail step before sending the runner to their training plan', async () => {
  const open = vi.fn()
  render(<PhoneRunGuide onOpenConnections={vi.fn()} onOpenPlan={open} />)
  expect(screen.getByText(/Open a day in your current training plan/)).toHaveTextContent('Log a run')
  await userEvent.click(screen.getByRole('button', { name: 'Open my training plan' }))
  expect(open).toHaveBeenCalledOnce()
})
