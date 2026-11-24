import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { planFixture } from '../../test/server'
import { useCurrentPlan } from '../account/useCurrentPlan'
import { useHomePlan } from './home-data'
import { useCalendarLink } from '../account/useCalendarLink'

const auth = { ...accountsOff, enabled: true, account: { id: 'synthetic-runner', name: 'Synthetic runner', email: null }, getToken: async () => 'test-token' }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
const summary = { id: 'own-plan', name: 'Spring 10K', raceName: 'Spring 10K', raceDate: '2099-04-01', createdAt: '2026-08-01T00:00:00Z', status: 'Active' as const }
const saved = { ...summary, inputs: { raceDate: summary.raceDate } as never, plan: { ...planFixture, race: { ...planFixture.race, date: summary.raceDate } } }
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
afterEach(() => vi.restoreAllMocks())

it('starts the coach read as soon as the plan list names the current plan, not after its details', async () => {
  const details = deferred<typeof saved>()
  vi.spyOn(api.me, 'plans').mockResolvedValue([summary])
  vi.spyOn(api.me, 'plan').mockReturnValue(details.promise)
  const coach = vi.spyOn(api.me, 'coachPlan').mockResolvedValue(saved)
  const { result } = renderHook(() => {
    const current = useCurrentPlan(true, '2026-11-24')
    return { current, home: useHomePlan(current.current, null, undefined, current.pendingId) }
  }, { wrapper })
  await waitFor(() => expect(coach).toHaveBeenCalledWith('test-token', 'own-plan'))
  // The details are still on their way: nothing is shown until the plan is known, so no other runner's plan can flash.
  expect(result.current.current.current).toBeUndefined()
  expect(result.current.home.plan).toBeNull()
  await act(async () => details.resolve(saved))
  await waitFor(() => expect(result.current.home.plan).toEqual(saved.plan))
  expect(result.current.current.pendingId).toBeNull()
  // The details arriving for the same plan do not start a second coach read.
  expect(coach).toHaveBeenCalledOnce()
})

it('offers no early id when there is no current plan', async () => {
  vi.spyOn(api.me, 'plans').mockResolvedValue([{ ...summary, status: 'Archived' as never }])
  const coach = vi.spyOn(api.me, 'coachPlan')
  const { result } = renderHook(() => useCurrentPlan(true, '2026-11-24'), { wrapper })
  await waitFor(() => expect(result.current.current).toBeNull())
  expect(result.current.pendingId).toBeNull()
  expect(coach).not.toHaveBeenCalled()
})

it('shows the plan Home last had when the runner comes back, while the coach read refreshes it', async () => {
  const current = { id: 'own-plan', name: 'Spring 10K', inputs: saved.inputs }
  const coach = vi.spyOn(api.me, 'coachPlan').mockResolvedValue(saved)
  const first = renderHook(() => useHomePlan(current, null), { wrapper })
  await waitFor(() => expect(first.result.current.plan).toEqual(saved.plan))
  first.unmount()
  coach.mockReturnValue(new Promise(() => {}))
  const again = renderHook(() => useHomePlan(current, null), { wrapper })
  expect(again.result.current.plan).toEqual(saved.plan)
  // Another runner on the same device never gets it.
  const other = { ...auth, account: { id: 'someone-else', name: 'Other', email: null } }
  const otherWrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={other}>{children}</AuthContext.Provider>
  expect(renderHook(() => useHomePlan(current, null), { wrapper: otherWrapper }).result.current.plan).toBeNull()
})

it('reads the calendar secret once per account, and again after a failed read', async () => {
  const calendar = vi.spyOn(api.me, 'calendar').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ token: 'synthetic-secret' } as never)
  const failed = renderHook(() => useCalendarLink('owner-a', true), { wrapper })
  await waitFor(() => expect(calendar).toHaveBeenCalledOnce())
  failed.unmount()
  const first = renderHook(() => useCalendarLink('owner-a', true), { wrapper })
  await waitFor(() => expect(first.result.current.token).toBe('synthetic-secret'))
  first.unmount()
  const second = renderHook(() => useCalendarLink('owner-a', true), { wrapper })
  await waitFor(() => expect(second.result.current.token).toBe('synthetic-secret'))
  expect(calendar).toHaveBeenCalledTimes(2)
})
