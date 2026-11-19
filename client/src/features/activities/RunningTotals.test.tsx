import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import { api } from '../../lib/api-client'
import type { ActivitySummary, LoggedRun } from '../../lib/types'
import { server } from '../../test/server'
import { RunningTotals } from './RunningTotals'

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

const signedIn = { ...accountsOff, enabled: true, getToken: () => Promise.resolve('token') }

const stravaRun = (localDate: string, distanceKm: number) => ({
  id: localDate, startedAt: `${localDate}T06:00:00Z`, localDate, kind: 'Run', distanceKm, movingSeconds: distanceKm * 360, paceSecondsPerKm: 360,
  plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null, source: { kind: 'Strava', viewUrl: null },
}) as unknown as ActivitySummary

const totals = (ownerId = 'runner-1', runs: ActivitySummary[] = []) =>
  <AuthContext.Provider value={signedIn}><RunningTotals ownerId={ownerId} units="km" today="2026-10-23" runs={runs} /></AuthContext.Provider>

const region = () => screen.findByRole('region', { name: 'Your running totals' })

describe('running totals on Runs', () => {
  it('shows a loading state instead of zero totals before running data arrives', () => {
    vi.spyOn(api.me, 'running').mockImplementation(() => new Promise(() => {}))
    render(totals())
    expect(screen.getByRole('status', { name: 'Loading running totals' })).toBeInTheDocument()
    expect(document.querySelector('.home-tiles')).toBeNull()
  })

  it('lets failed totals retry without treating failure as no runs', async () => {
    let failed = true
    server.use(http.get('*/api/v1/me/running', () => failed ? new HttpResponse(null, { status: 503 }) : HttpResponse.json([{ date: '2026-10-22', distanceKm: 5, source: 'Uploaded' }])))
    render(totals())
    await screen.findByRole('alert')
    expect(document.querySelector('.home-tiles')).toBeNull()
    failed = false
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry running totals' }))
    expect(await within(await region()).findAllByText('5')).not.toHaveLength(0)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows this month, this year, the weekly average and all time from uploads and ticked sessions', async () => {
    const log: LoggedRun[] = [
      { date: '2026-10-18', distanceKm: 42.2, source: 'Uploaded' },
      { date: '2026-10-02', distanceKm: 10, source: 'Ticked' },
      { date: '2026-09-05', distanceKm: 12, source: 'Uploaded' },
    ] as LoggedRun[]
    server.use(http.get('*/api/v1/me/running', () => HttpResponse.json(log)))
    render(totals())

    const running = await region()
    expect(await within(running).findByText('52.2')).toBeInTheDocument()
    expect(within(running).getByText(/Totals include your saved running history/)).toBeInTheDocument()
    // This year, and All time (the same runs here).
    expect(await within(running).findAllByText('64.2')).toHaveLength(2)
    expect(within(running).getByText(/40.2 km \(335%\) more than 1 Sept–23 Sept/)).toBeInTheDocument()
  })

  it('counts available Strava distance automatically and says when it drops out', async () => {
    server.use(http.get('*/api/v1/me/running', ({ request }) => {
      if (new URL(request.url).searchParams.get('allTime') === 'true') return HttpResponse.json([])
      expect(new URL(request.url).searchParams.get('includeSynced')).toBe('true')
      return HttpResponse.json([{ date: '2026-10-21', distanceKm: 8, source: 'Strava', distanceUnreported: false, cachedUntil: '2027-01-01T00:00:00Z' }])
    }))
    render(totals('runner-1', [stravaRun('2026-10-21', 8)]))

    const running = await region()
    expect(await within(running).findAllByText('8')).toHaveLength(2)
    expect(within(running).getAllByText('8 km from Strava')).toHaveLength(2)
    expect(within(running).getAllByText('1 run')).toHaveLength(2)
    expect(within(running).queryByText('—')).not.toBeInTheDocument()
    expect(within(running).getByText(/Strava runs count while Taperday holds them \(up to 7 days\)/)).toBeInTheDocument()
  })

  it('counts a saved time-only run while keeping its distance unreported', async () => {
    server.use(http.get('*/api/v1/me/running', () => HttpResponse.json([{ date: '2026-10-20', distanceKm: 0, source: 'Ticked', distanceUnreported: true }])))
    render(totals())
    const running = await region()
    expect(await within(running).findAllByText('1 run')).toHaveLength(2)
    expect(within(running).getAllByText('—')).toHaveLength(2)
  })

  it('refreshes automatic distance when the runner returns to the app', async () => {
    let available = false
    let reads = 0
    server.use(http.get('*/api/v1/me/running', ({ request }) => {
      if (new URL(request.url).searchParams.get('allTime') !== 'true') reads++
      return HttpResponse.json(available ? [{ date: '2026-10-22', distanceKm: 10, source: 'Strava', cachedUntil: '2027-01-01T00:00:00Z' }] : [])
    }))
    render(totals())
    await vi.waitFor(() => expect(reads).toBe(1))
    expect(screen.queryByRole('region', { name: 'Your running totals' })).toBeNull()
    available = true
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    try {
      fireEvent(document, new Event('visibilitychange'))
      const running = await region()
      expect(await within(running).findAllByText('10')).toHaveLength(2)
      expect(within(running).getAllByText('1 run')).toHaveLength(2)
    } finally { visible.mockRestore() }
  })

  it('never shows the previous account’s totals while a different account loads', async () => {
    let release!: () => void
    const pending = new Promise<void>(resolve => { release = resolve })
    let reads = 0
    server.use(http.get('*/api/v1/me/running', async () => {
      const first = ++reads === 1
      if (!first) await pending
      return HttpResponse.json([{ date: '2026-10-22', distanceKm: first ? 10 : 20, source: 'Uploaded' }])
    }))
    const { rerender } = render(totals('one'))
    expect(await within(await region()).findAllByText('10')).toHaveLength(2)
    rerender(totals('two'))
    expect(screen.queryByText('10')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading running totals' })).toBeInTheDocument()
    release()
    expect(await within(await region()).findAllByText('20')).toHaveLength(3)
  })

  it('refreshes at imported expiry and does not claim a missing distance is level with zero', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-10-23T06:00:00Z'))
    let reads = 0
    server.use(http.get('*/api/v1/me/running', () => HttpResponse.json(++reads === 1
      ? [{ date: '2026-10-22', distanceKm: 10, source: 'Strava', cachedUntil: '2026-10-23T06:01:00Z' }]
      : [{ date: '2026-10-22', distanceKm: 0, source: 'Ticked', distanceUnreported: true }])))
    render(totals())
    await vi.waitFor(() => expect(screen.getAllByText('10')).toHaveLength(2))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_100) })
    await vi.waitFor(() => expect(screen.getAllByText('—')).toHaveLength(2))
    expect(screen.getByText(/1 run has no distance and is left out of distance totals/)).toBeInTheDocument()
    expect(screen.getByText('Comparison unavailable while distances are missing.')).toBeInTheDocument()
    // The two totals reads, and the one all-time read.
    expect(reads).toBe(3)
  })
})
