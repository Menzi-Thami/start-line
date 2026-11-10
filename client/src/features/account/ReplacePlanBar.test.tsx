import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff, type Auth } from '../../app/auth-context'
import type { GeneratePlanRequest } from '../../lib/types'
import { server } from '../../test/server'
import { ReplacePlanBar } from './ReplacePlanBar'

const auth: Auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'qa@example.test' }, getToken: () => Promise.resolve('token') }
const base: GeneratePlanRequest = { raceSlug: null, raceName: 'Parkrun PB', distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [] } as unknown as GeneratePlanRequest
const saved = { id: 'plan-1', name: 'Parkrun PB', inputs: base }

function bar(request: GeneratePlanRequest, raceName: string) {
  const onReplaced = vi.fn()
  const onKeep = vi.fn()
  render(<AuthContext.Provider value={auth}><ReplacePlanBar request={request} raceName={raceName} saved={saved} onReplaced={onReplaced} onKeep={onKeep} /></AuthContext.Provider>)
  return { onReplaced, onKeep, user: userEvent.setup() }
}

describe('a plan on screen that is not the saved one', () => {
  it('replaces the saved plan with another race only when asked, and keeps it otherwise', async () => {
    const bodies: unknown[] = []
    server.use(http.post('*/api/v1/me/plans', async ({ request }) => { bodies.push(await request.json()); return HttpResponse.json({ id: 'plan-2', name: 'Two Oceans' }, { status: 201 }) }))
    const { user, onReplaced, onKeep } = bar({ ...base, raceName: 'Two Oceans', distanceKm: 56, raceDate: '2027-04-04' } as GeneratePlanRequest, 'Two Oceans')

    expect(screen.getByText(/Your saved plan is still Parkrun PB/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep my old plan' }))
    expect(onKeep).toHaveBeenCalled()
    expect(bodies).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Replace my plan' }))
    expect(onReplaced).toHaveBeenCalled()
    expect(bodies[0]).toMatchObject({ replaceCurrent: true })
    expect((bodies[0] as { expectedPlanId?: string }).expectedPlanId).toBeUndefined()
  })

  it('updates the saved plan in place for the same race with new answers, and says when saving failed', async () => {
    const bodies: unknown[] = []
    let fail = true
    server.use(http.post('*/api/v1/me/plans', async ({ request }) => {
      bodies.push(await request.json())
      if (fail) { fail = false; return HttpResponse.json({ title: 'That didn’t save.' }, { status: 500 }) }
      return HttpResponse.json({ id: 'plan-1', name: 'Parkrun PB' }, { status: 201 })
    }))
    const { user, onReplaced } = bar({ ...base, goalTime: '00:23:00' } as GeneratePlanRequest, 'Parkrun PB')

    expect(screen.getByText(/still has your earlier answers/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Update my plan' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onReplaced).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Update my plan' }))
    expect(onReplaced).toHaveBeenCalled()
    expect(bodies[1]).toMatchObject({ replaceCurrent: true, expectedPlanId: 'plan-1', name: 'Parkrun PB' })
  })
})
