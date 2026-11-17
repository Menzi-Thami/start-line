import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as client from '../../lib/api-client'
import { SignInWait } from './SignInWait'
import { SLOW_AFTER_MS, WAKE_CHECK_MS } from './wait-film'

beforeEach(() => { vi.useFakeTimers(); vi.spyOn(client, 'isUp').mockResolvedValue(false) })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

it('shows the runner only for a slow load, lets motion pause and resumes without affecting retry or tips', async () => {
  const retry = vi.fn(), signOut = vi.fn()
  const { container } = render(<SignInWait onRetry={retry} onSignOut={signOut} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS - 1))
  expect(container.querySelector('.account-warmup')).toBeNull()
  expect(client.isUp).not.toHaveBeenCalled()
  await act(() => vi.advanceTimersByTimeAsync(1))
  expect(container.querySelector('.runner-sprint')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('status')).toHaveTextContent('Connecting to Taperday')
  fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-paused', 'true')
  expect(screen.getByRole('button', { name: 'Resume animation' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: 'Next tip' }))
  expect(screen.getByText(/completed training chapters and race results are kept in Journey/)).toBeVisible()
  vi.mocked(client.isUp).mockResolvedValue(true)
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS))
  expect(screen.getByRole('status')).toHaveTextContent('Loading your saved account')
  expect(screen.getByText(/completed training chapters and race results are kept in Journey/)).toBeVisible()
  expect(screen.queryByText(/Almost there|100%/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Resume animation' }))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-paused', 'false')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(retry).toHaveBeenCalledOnce()
  expect(signOut).toHaveBeenCalledOnce()
})

it('keeps a saved Home quiet on fast loads and gives reduced-motion users a still runner with usable tips', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  const { container } = render(<SignInWait quietUntilSlow onRetry={vi.fn()} onSignOut={vi.fn()} />)
  expect(container).toBeEmptyDOMElement()
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  expect(container.querySelector('.account-warmup')).toHaveAttribute('data-paused', 'true')
  expect(screen.queryByRole('button', { name: /animation/ })).not.toBeInTheDocument()
  expect(screen.getByText(/Your saved Home stays below/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Next tip' }))
  expect(screen.getByText(/completed training chapters/)).toBeVisible()
})

it('stops dependency checks after the actual account load removes the warm-up', async () => {
  const { unmount } = render(<SignInWait onRetry={vi.fn()} onSignOut={vi.fn()} />)
  await act(() => vi.advanceTimersByTimeAsync(SLOW_AFTER_MS))
  expect(client.isUp).toHaveBeenCalledWith('live')
  const before = vi.mocked(client.isUp).mock.calls.length
  unmount()
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS * 3))
  expect(client.isUp).toHaveBeenCalledTimes(before)
  expect(screen.queryByRole('region', { name: 'Connecting to Taperday' })).not.toBeInTheDocument()
})
