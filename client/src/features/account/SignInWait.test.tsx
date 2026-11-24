import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as client from '../../lib/api-client'
import { SignInWait } from './SignInWait'
import { SLOW_AFTER_MS, WAKE_CHECK_MS } from './wait-film'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(client, 'isUp').mockResolvedValue(true)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('shows the compact runner first, then a plain slow-connection status with retry and sign out', async () => {
  const retry = vi.fn(), signOut = vi.fn()
  const { container } = render(<SignInWait onRetry={retry} onSignOut={signOut} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1))
  expect(container.querySelector('.account-warmup')).toBeNull()
  expect(screen.getByRole('status', { name: 'Checking your account' })).toBeInTheDocument()
  expect(container.querySelector('.runner-loading .runner-sprint')).toBeInTheDocument()
  expect(client.isUp).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(container.querySelector('.account-warmup .runner-sprint')).toHaveAttribute('aria-hidden', 'true')
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS))
  expect(screen.getByRole('status')).toHaveTextContent('Loading your saved account')
  expect(screen.queryByText(/Almost there|100%|While you wait/)).not.toBeInTheDocument()
  // Nothing to pause: no tips rotate and the runner's motion is finite.
  expect(screen.queryByRole('button', { name: /warm-up|tip/i })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Try again', 'Sign out'])
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(signOut).toHaveBeenCalledOnce()
})

it('keeps saved Home quiet on fast loads and marks reduced motion on a slow one', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const { container } = render(<SignInWait quietUntilSlow onRetry={vi.fn()} onSignOut={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-reduced-motion', 'true')
  expect(screen.getByText(/Your saved Home stays below/)).toBeVisible()
})

it('stops dependency checks and timers after the account load removes the wait', async () => {
  const { unmount } = render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  expect(client.isUp).toHaveBeenCalledWith('live')
  const before = vi.mocked(client.isUp).mock.calls.length
  unmount()
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS * 3))
  expect(client.isUp).toHaveBeenCalledTimes(before)
  expect(vi.getTimerCount()).toBe(0)
  expect(screen.queryByRole('region', { name: 'Connecting to Taperday' })).not.toBeInTheDocument()
})
