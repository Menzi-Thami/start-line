import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FindingPlan } from './FindingPlan'

vi.mock('./useWakeStep', () => ({ useWakeStep: () => 'server' }))

describe('post-sign-in handoff', () => {
  it('does not show a large signed-in-as banner during normal loading', () => {
    render(<FindingPlan name="Menzi" onRetry={() => {}} onSignOut={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening your training…')
    expect(screen.queryByText(/Signed in as Menzi/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveClass('finding-plan-slow')
  })
})
