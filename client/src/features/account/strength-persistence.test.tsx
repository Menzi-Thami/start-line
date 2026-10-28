import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { GeneratePlanRequest, Runner } from '../../lib/types'
import { planFixture, server } from '../../test/server'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 9))
})
afterEach(() => vi.useRealTimers())

const runner = { id: 'strength-runner', displayName: 'Thandi', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false } as Runner
const auth: Auth = { enabled: true, loading: false, account: { name: 'Thandi', email: 'strength@example.test' }, error: null, signIn: vi.fn(), signUp: vi.fn(), signOut: vi.fn(), getToken: async () => 'test-token' }
const strengthSession = planFixture.weeks[0]!.sessions.find((s) => s.type === 'Strength')!
const mount = (value = auth) => render(<AuthContext.Provider value={value}><App /></AuthContext.Provider>)

// Controlled account contract, not live Entra or SQL: the server state outlives every mounted app/storage reset.
function account() {
  let inputs: GeneratePlanRequest = { raceSlug: null, raceName: 'Parkrun PB', distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', currentWeeklyKm: null, experience: 'Regular', planFrom: '2026-10-08', strengthDays: [] }
  let failSave = false
  const writes: { plan: GeneratePlanRequest; replaceCurrent: boolean }[] = []
  const planFor = (request: GeneratePlanRequest) => ({ ...planFixture, weeks: planFixture.weeks.map((week) => ({ ...week, sessions: [...week.sessions.filter((s) => s.type !== 'Strength'), ...(request.strengthDays?.length && week.phase !== 'RaceWeek' ? [{ ...strengthSession, date: week.startDate }] : [])] })) })
  const summary = { id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }
  const saved = () => ({ ...summary, inputs, plan: planFor(inputs), coaching: [] })
  server.use(
    http.get('*/api/v1/me', () => HttpResponse.json(runner)),
    http.get('*/api/v1/me/plans', () => HttpResponse.json([summary])),
    http.get('*/api/v1/me/plans/:id', () => HttpResponse.json(saved())),
    http.post('*/api/v1/me/plans/:id/coach', () => HttpResponse.json(saved())),
    http.post('*/api/v1/plans', async ({ request }) => HttpResponse.json(planFor(await request.json() as GeneratePlanRequest))),
    http.post('*/api/v1/me/plans', async ({ request }) => {
      expect(request.headers.get('Authorization')).toBe('Bearer test-token')
      if (failSave) return HttpResponse.json({ title: 'Could not save changes. Try again.' }, { status: 503 })
      const body = await request.json() as { plan: GeneratePlanRequest; replaceCurrent: boolean }
      writes.push(body)
      inputs = body.plan
      return HttpResponse.json(summary, { status: 201 })
    }),
  )
  return { writes, fail: (value: boolean) => { failSave = value } }
}

async function addStrength(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('button', { name: 'Delete plan' })
  await user.click(screen.getByRole('tab', { name: 'Strength' }))
  await user.click(screen.getByRole('button', { name: 'Add strength days' }))
  await user.click(screen.getByText('Add strength and mobility sessions'))
  await user.click(within(screen.getByRole('group', { name: 'Strength days' })).getByRole('checkbox', { name: 'Monday' }))
  await user.click(screen.getByRole('button', { name: 'Build my plan' }))
  await screen.findByRole('button', { name: 'Save changes' })
}

describe('adding strength to an existing account plan', () => {
  it('saves once and restores strength after sign-out and a new sign-in with no device snapshot', async () => {
    vi.setSystemTime(new Date(2026, 9, 21, 9))
    const db = account()
    const user = userEvent.setup()
    const first = mount()
    await addStrength(user)
    expect(screen.getByText(/Changes aren’t saved to your account yet/)).toBeInTheDocument()
    await user.dblClick(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
    // A null version is the historical v1 contract; adding strength must not upgrade it to v2.
    expect(db.writes[0]).toMatchObject({ replaceCurrent: true, plan: { strengthDays: ['Monday'], raceName: 'Parkrun PB', planFrom: '2026-10-08', version: null } })
    await screen.findByRole('button', { name: 'Delete plan' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
    first.unmount()
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
    const signedOut = mount({ ...auth, account: null, getToken: async () => null })
    expect(await screen.findAllByRole('button', { name: 'Sign in' })).not.toHaveLength(0)
    signedOut.unmount()
    window.history.replaceState(null, '', '/')
    mount({ ...auth })
    await screen.findByRole('button', { name: 'Delete plan' })
    await user.click(screen.getByRole('tab', { name: 'Strength' }))
    expect(screen.queryByRole('button', { name: 'Add strength days' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Change strength days' })).toBeInTheDocument()
    expect(screen.getAllByText('Strength & mobility').length).toBeGreaterThan(0)
  })

  it('keeps unsaved changes available after a save failure and lets the runner retry', async () => {
    const db = account()
    const user = userEvent.setup()
    mount()
    await addStrength(user)
    db.fail(true)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Please try again')
    expect(db.writes).toHaveLength(0)
    db.fail(false)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(db.writes).toHaveLength(1))
  })
})
