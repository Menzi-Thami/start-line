import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import { server } from '../../test/server'
import { useCheckIns } from './useCheckIns'
import { planFixture } from '../../test/server'
import { api } from '../../lib/api-client'
import type { CheckIn } from '../../lib/types'

afterEach(() => vi.restoreAllMocks())

const auth = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('synthetic-token') }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>

it('retains loaded entries when a refresh fails, and never shows another plan’s history', async () => {
  let failed = false
  server.use(http.get('*/api/v1/me/plans/:id/check-ins', ({ params }) => failed ? new HttpResponse(null, { status: 503 }) : HttpResponse.json([
    { id: `entry-${params.id}`, date: '2026-10-14', sessionType: 'Easy', isAdditional: true, status: 'Done', distanceKm: 10 },
  ])))
  const { result, rerender } = renderHook(({ planId }) => useCheckIns(planId), { initialProps: { planId: 'one' }, wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  failed = true
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.entries.map(c => c.id)).toEqual(['entry-one'])
  rerender({ planId: 'two' })
  expect(result.current.entries).toEqual([])
  expect(result.current.ready).toBe(false)
  await waitFor(() => expect(result.current.failed).toBe(true))
  failed = false
  act(() => result.current.retry())
  await waitFor(() => expect(result.current.entries.map(c => c.id)).toEqual(['entry-two']))
  expect(result.current.failed).toBe(false)
})

it('treats an expired sign-in as a failed load, rather than an empty saved history', async () => {
  const { result } = renderHook(() => useCheckIns('one'), { wrapper: ({ children }) => <AuthContext.Provider value={accountsOff}>{children}</AuthContext.Provider> })
  await waitFor(() => expect(result.current.failed).toBe(true))
  expect(result.current.ready).toBe(false)
})

it.each(['save', 'remove'])('does not let a late refresh undo a successful %s', async action => {
  const entry = { id: 'extra', date: '2026-10-14', sessionType: 'Easy', isAdditional: true, status: 'Done', distanceKm: 10 } as CheckIn
  server.use(
    http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([entry])),
    http.put('*/api/v1/me/plans/:planId/check-ins/additional/:id/:date/:sessionType', () => HttpResponse.json({ ...entry, distanceKm: 11 })),
    http.delete('*/api/v1/me/plans/:planId/check-ins/additional/:id', () => new HttpResponse(null, { status: 204 })),
  )
  const { result } = renderHook(() => useCheckIns('one'), { wrapper })
  await waitFor(() => expect(result.current.ready).toBe(true))
  let release!: (entries: CheckIn[]) => void
  const pending = new Promise<CheckIn[]>(resolve => { release = resolve })
  const refresh = vi.spyOn(api.me, 'checkIns').mockReturnValueOnce(pending)
  act(() => result.current.retry())
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  await act(async () => {
    if (action === 'save') await result.current.saveAdditional('extra', { ...planFixture.weeks[0]!.sessions[0]!, date: entry.date, type: 'Easy' }, { status: 'Done', effort: null, distanceKm: 11, distanceUnreported: false })
    else await result.current.removeAdditional('extra')
  })
  await act(async () => { release([entry]); await pending })
  expect(result.current.entries.map(c => c.distanceKm)).toEqual(action === 'save' ? [11] : [])
})
