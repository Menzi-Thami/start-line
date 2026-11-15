import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import { planFixture } from '../../test/server'
import { currentTraining, useCurrentPlan } from './useCurrentPlan'

const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'phase@example.test' }, getToken: async () => 'test-token' }
const wrapper = ({ children }: { children: React.ReactNode }) => <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
afterEach(() => vi.restoreAllMocks())

it('keeps race day current, then drops a stale active response immediately after it ends', async () => {
  const summary = { id: 'own-plan', name: 'Hoka Half', raceName: 'Hoka Half', raceDate: '2026-11-14', createdAt: '2026-08-01T00:00:00Z', status: 'Active' as const }
  vi.spyOn(api.me, 'plans').mockResolvedValue([summary])
  const get = vi.spyOn(api.me, 'plan').mockResolvedValue({ ...summary, inputs: { raceDate: summary.raceDate } as never, plan: { ...planFixture, race: { ...planFixture.race, date: summary.raceDate } } })
  const { result, rerender } = renderHook(({ today }) => useCurrentPlan(true, today), { wrapper, initialProps: { today: '2026-11-14' } })
  await waitFor(() => expect(result.current.current?.id).toBe('own-plan'))
  rerender({ today: '2026-11-15' })
  expect(result.current.current).toBeNull()
  await act(async () => result.current.refresh())
  expect(result.current.current).toBeNull()
  expect(get).toHaveBeenCalledTimes(1)
})

it('cannot reopen an old offline copy as current training after race day', () => {
  const saved = { id: 'own-plan', name: 'Hoka Half', inputs: { raceDate: '2026-11-14' } }
  expect(currentTraining(saved as never, '2026-11-14')).toBe(saved)
  expect(currentTraining(saved as never, '2026-11-15')).toBeNull()
})
