import { createElement, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { accountsOff, AuthContext } from '../../app/auth-context'
import { planFixture, server } from '../../test/server'
import { toRequest, type PlanInputs } from '../../lib/plan-url'
import { samePlan, useCurrentPlan } from './useCurrentPlan'

const inputs: PlanInputs = {
  raceName: 'Parkrun PB',
  distanceKm: 5,
  raceDate: '2026-12-13',
  goalSeconds: 1470,
  runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
  longRunDay: 'Sunday',
  experience: 'Regular',
  strengthDays: [],
  planFrom: '2026-10-08',
  version: 2,
}

describe('the same plan', () => {
  it('enables saving when a recent result is added or removed, even though the workouts stay the same', () => {
    const shown = toRequest({ ...inputs, recent: { km: 10, seconds: 3000, date: '2026-10-01' } })
    const saved = toRequest(inputs)

    expect(samePlan(shown, saved)).toBe(false)
    expect(samePlan(saved, shown)).toBe(false)
    expect(samePlan(shown, { ...shown })).toBe(true)
    expect(samePlan(shown, { ...shown, recentResultTime: '00:49:00' })).toBe(false)
  })

  it('is a different plan when an answer that shapes it differs', () => {
    expect(samePlan(toRequest(inputs), toRequest({ ...inputs, goalSeconds: 1440 }))).toBe(false)
  })

  it('recognizes the default custom race name and ignores a catalogue snapshot when comparing live plans', () => {
    expect(samePlan(toRequest({ ...inputs, raceName: undefined }), toRequest({ ...inputs, raceName: 'Your race' }))).toBe(true)
    const catalogue = toRequest({ ...inputs, raceSlug: 'comrades-2027' })
    expect(samePlan(catalogue, { ...catalogue, raceName: 'Comrades Marathon', raceDate: '2027-06-13', distanceKm: 90 })).toBe(true)
  })
})

const auth = { ...accountsOff, enabled: true, account: { name: 'Synthetic runner', email: 'current-plan@example.test' }, getToken: async () => 'test-token' }
const wrapper = ({ children }: PropsWithChildren) => createElement(AuthContext.Provider, { value: auth }, children)

describe('current plan lookup failures', () => {
  beforeEach(() => server.use(http.get('*/api/v1/me/plans/plan-1', () => HttpResponse.json({ id: 'plan-1', name: 'Parkrun PB', status: 'Active', inputs: toRequest(inputs), plan: planFixture }))))
  it('keeps a failed initial lookup unknown and recovers the saved plan on retry', async () => {
    let failed = true
    server.use(http.get('*/api/v1/me/plans', () => failed
      ? HttpResponse.json({ title: 'Temporarily unavailable' }, { status: 503 })
      : HttpResponse.json([{ id: 'plan-1', status: 'Active', raceDate: inputs.raceDate }])))
    const { result } = renderHook(() => useCurrentPlan(true, '2026-10-20'), { wrapper })
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.current).toBeUndefined()
    failed = false
    await act(() => result.current.refresh())
    expect(result.current.current?.id).toBe('plan-1')
    expect(result.current.failed).toBe(false)
  })

  it('retains a known plan when a later lookup fails', async () => {
    let failed = false
    server.use(http.get('*/api/v1/me/plans', () => failed
      ? HttpResponse.json({ title: 'Temporarily unavailable' }, { status: 503 })
      : HttpResponse.json([{ id: 'plan-1', status: 'Active', raceDate: inputs.raceDate }])))
    const { result } = renderHook(() => useCurrentPlan(true, '2026-10-20'), { wrapper })
    await waitFor(() => expect(result.current.current?.id).toBe('plan-1'))
    failed = true
    await act(() => result.current.refresh())
    expect(result.current.failed).toBe(true)
    expect(result.current.current?.id).toBe('plan-1')
  })
})
