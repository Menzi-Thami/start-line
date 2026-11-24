import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FindingPlan } from './FindingPlan'
import { SLOW_AFTER_MS } from './wait-film'

vi.mock('./useWakeStep', () => ({ useWakeStep: () => 'server' }))

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('post-sign-in handoff', () => {
  it('does not show a large signed-in-as banner during normal loading', () => {
    const { container } = render(<FindingPlan name="Menzi" onRetry={() => {}} onSignOut={() => {}} />)
    expect(screen.getByRole('status')).toHaveTextContent('Opening your training…')
    expect(screen.queryByText(/Signed in as Menzi/i)).not.toBeInTheDocument()
    expect(container.querySelector('.runner-loading')).toHaveClass('runner-loading-compact')
    expect(container.querySelector('.runner-sprint')).toBeInTheDocument()
    expect(container.querySelector('.finding-plan')).not.toHaveClass('finding-plan-slow')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('announces the slow wait with its reason and offers retry and sign out outside the status text', async () => {
    const retry = vi.fn(), signOut = vi.fn()
    render(<FindingPlan name={null} onRetry={retry} onSignOut={signOut} />)
    await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Your account is taking longer than expected')
    expect(status).toHaveTextContent('Connecting to Taperday. You can retry without signing in again.')
    expect(status.querySelector('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(retry).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledOnce()
  })
})
