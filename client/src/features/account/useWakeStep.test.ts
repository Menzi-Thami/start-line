import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as client from '../../lib/api-client'
import { useWakeStep } from './useWakeStep'
import { WAKE_CHECK_MS } from './wait-film'

let visibility: DocumentVisibilityState = 'visible'
const setVisibility = (value: DocumentVisibilityState) => act(() => { visibility = value; document.dispatchEvent(new Event('visibilitychange')) })
beforeEach(() => {
  vi.useFakeTimers()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.spyOn(client, 'isUp').mockResolvedValue(false)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

it('stops checking while the app is in the background and resumes when it comes back', async () => {
  renderHook(() => useWakeStep(true))
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS * 2))
  const visible = vi.mocked(client.isUp).mock.calls.length
  expect(visible).toBeGreaterThan(1)
  setVisibility('hidden')
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS * 20))
  expect(vi.mocked(client.isUp).mock.calls.length).toBeLessThanOrEqual(visible + 1)
  const hidden = vi.mocked(client.isUp).mock.calls.length
  setVisibility('visible')
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS))
  expect(vi.mocked(client.isUp).mock.calls.length).toBeGreaterThan(hidden)
})

it('leaves no timer or listener behind when the wait ends in the background', async () => {
  const remove = vi.spyOn(document, 'removeEventListener')
  const { unmount } = renderHook(() => useWakeStep(true))
  await act(() => vi.advanceTimersByTimeAsync(0))
  setVisibility('hidden')
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS))
  unmount()
  await act(() => vi.advanceTimersByTimeAsync(WAKE_CHECK_MS * 3))
  expect(vi.getTimerCount()).toBe(0)
  expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
})
