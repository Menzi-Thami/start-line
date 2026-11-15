import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { todayInZone, useToday } from './useToday'

afterEach(() => vi.useRealTimers())

it.each([
  ['Africa/Johannesburg', '2026-11-15'], ['America/New_York', '2026-11-14'],
  ['Pacific/Honolulu', '2026-11-14'], ['Pacific/Auckland', '2026-11-15'],
])('uses the runner’s local date in %s', (zone, date) => {
  expect(todayInZone(new Date('2026-11-14T22:00:00Z'), zone)).toBe(date)
})

it('changes phase at local midnight and after returning to the app, and clears its timer', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-14T21:59:59Z'))
  const { result, unmount } = renderHook(() => useToday('Africa/Johannesburg'))
  expect(result.current).toBe('2026-11-14')
  act(() => vi.advanceTimersByTime(1100))
  expect(result.current).toBe('2026-11-15')
  act(() => { vi.setSystemTime(new Date('2026-11-16T08:00:00Z')); document.dispatchEvent(new Event('visibilitychange')) })
  expect(result.current).toBe('2026-11-16')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
