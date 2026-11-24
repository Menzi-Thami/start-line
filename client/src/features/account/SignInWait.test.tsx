import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as client from '../../lib/api-client'
import { SignInWait, WARMUP_TIP_MS } from './SignInWait'
import { SLOW_AFTER_MS, WAKE_CHECK_MS } from './wait-film'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(client, 'isUp').mockResolvedValue(true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('starts automatically on a slow load, rotates tips, and pauses/resumes without affecting retry', async () => {
  const retry = vi.fn(), signOut = vi.fn()
  const { container } = render(<SignInWait onRetry={retry} onSignOut={signOut} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1))
  expect(container.querySelector('.account-warmup')).toBeNull()
  expect(screen.getByRole('status', { name: 'Checking your account' }).querySelector('.runner-sprint')).toBeInTheDocument()
  expect(client.isUp).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(container.querySelector('.runner-sprint')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByRole('button', { name: 'Next tip' })).not.toBeInTheDocument()
  expect(screen.getByText(/A free Strava account can bring/)).toBeVisible()
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS))
  expect(screen.getByText(/completed training chapters and race results are kept in Journey/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Pause warm-up' }))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-paused', 'true')
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS * 2))
  expect(screen.getByText(/completed training chapters/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Resume warm-up' }))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-paused', 'false')
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS))
  expect(screen.getByText(/Recovery has its own plan/)).toBeVisible()
  expect(screen.getByRole('status')).toHaveTextContent('Loading your saved account')
  expect(screen.queryByText(/Almost there|100%/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(signOut).toHaveBeenCalledOnce()
})

it('keeps saved Home quiet on fast loads and plays tips with a pause control in reduced motion', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const { container } = render(<SignInWait quietUntilSlow onRetry={vi.fn()} onSignOut={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-reduced-motion', 'true')
  expect(container.querySelector('.account-warmup-tip > p')).toHaveAttribute('aria-live', 'off')
  expect(screen.getByText(/Your saved Home stays below/)).toBeVisible()
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS))
  expect(screen.getByText(/completed training chapters/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Pause warm-up' }))
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS * 2))
  expect(screen.getByText(/completed training chapters/)).toBeVisible()
})

it('suspends tips in a hidden tab and gives a full reading interval on return', async () => {
  render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS * 2))
  expect(screen.getByText(/A free Strava account can bring/)).toBeVisible()
  act(() => { visibility.mockReturnValue('visible'); document.dispatchEvent(new Event('visibilitychange')) })
  await act(() => vi.advanceTimersByTimeAsync(WARMUP_TIP_MS - 1))
  expect(screen.getByText(/A free Strava account can bring/)).toBeVisible()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(screen.getByText(/completed training chapters/)).toBeVisible()
})

it('stops dependency checks and autoplay after the account load removes the warm-up', async () => {
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
