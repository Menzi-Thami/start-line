import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { Activity, RunData } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import { server } from '../../test/server'
import { RunDataPanel } from './RunDataPanel'
import { RunProvenance } from './RunProvenance'

const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve('test-token') }
const longRun = longRunFixture as Activity

function data(overrides: Partial<RunData> = {}): RunData {
  return {
    sources: { uploads: 1, fit: 1, gpx: 0, tcx: 0, unknownFormat: 0, strava: 1, stravaConnected: true, stravaStatus: 'Active', lastSyncedAt: '2026-10-28T06:00:00Z', stravaPending: 0 },
    totals: [
      { period: 'week', from: '2026-10-26', to: '2026-10-28', totalKm: 14, runs: 2, tickedKm: 4, tickedRuns: 1, uploadedKm: 10, uploadedRuns: 1, stravaKm: 0, stravaRuns: 0, withoutDistance: 0 },
      { period: 'month', from: '2026-10-01', to: '2026-10-28', totalKm: 52.5, runs: 7, tickedKm: 12.5, tickedRuns: 3, uploadedKm: 30, uploadedRuns: 3, stravaKm: 10, stravaRuns: 1, withoutDistance: 1 },
    ],
    missing: { runs: 2, withoutHeartRate: 2, withoutElevation: 0, withoutSplits: 0, heartRateConsent: false },
    syncIssues: [
      { stravaActivityId: 123, reason: 'Strava answered 503', skipped: false, at: '2026-10-27T06:00:00Z' },
      { stravaActivityId: 456, reason: 'That run is too short to show.', skipped: true, at: '2026-10-26T06:00:00Z' },
    ],
    ...overrides,
  }
}

function renderPanel() {
  render(
    <AuthContext.Provider value={auth}>
      <RunDataPanel units="km" />
    </AuthContext.Provider>,
  )
}

describe('Your run data', () => {
  it('explains where each total comes from and only flags runs that failed to arrive', async () => {
    server.use(http.get('*/api/v1/me/run-data', () => HttpResponse.json(data())))
    const user = userEvent.setup()
    renderPanel()

    expect(await screen.findByText('· 1 run from Strava didn’t arrive')).toBeInTheDocument()
    await user.click(screen.getByText(/Your run data/))
    const week = screen.getByRole('table', { name: 'This week: where the total comes from' })
    expect(within(week).getByRole('rowheader', { name: 'Checked in by you' })).toBeInTheDocument()
    expect(within(week).queryByRole('rowheader', { name: 'From Strava' })).not.toBeInTheDocument()
    expect(screen.getByText('1 run counted without a distance: ticked off with no distance and no linked run.')).toBeInTheDocument()
    expect(screen.getByText(/you haven’t allowed Taperday to keep heart rate/)).toBeInTheDocument()
    expect(screen.getByText(/That run is too short to show\./)).toBeInTheDocument()
    expect(screen.queryByText(/duplicate/i)).not.toBeInTheDocument()
  })

  it('retries runs that failed to arrive from Strava', async () => {
    let retried = 0
    server.use(
      http.get('*/api/v1/me/run-data', () => HttpResponse.json(data())),
      http.post('*/api/v1/me/run-data/retry-strava', () => {
        retried++
        return HttpResponse.json({ retried: 1 })
      }),
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByText(/Your run data/))

    await user.click(await screen.findByRole('button', { name: 'Try it again' }))

    expect(retried).toBe(1)
    expect(await screen.findByText('Trying 1 run from Strava again.')).toBeInTheDocument()
  })

  it('treats an unexpected answer as unavailable, with a way to try again', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/me/run-data', () => (++calls === 1 ? HttpResponse.json([]) : HttpResponse.json(data()))))
    const user = userEvent.setup()
    renderPanel()
    await user.click(await screen.findByText(/Your run data/))

    expect(await screen.findByText('Run data isn’t available right now.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('What your totals are made of')).toBeInTheDocument()
  })
})

describe('Where a run came from', () => {
  it('is one line for an upload', () => {
    const run = { ...longRun, source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null, format: 'Gpx', fileName: 'Sunday long.gpx', fetchedAt: null, addedAt: '2026-10-20T08:00:00Z' } } as Activity
    render(<RunProvenance run={run} />)
    expect(screen.getByText('Uploaded from a GPX file · 20 Oct')).toBeInTheDocument()
  })

  it('adds nothing for a Strava run, which has its own line', () => {
    const run = { ...longRun, source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/1', recordedOnGarmin: false, cachedUntil: '2026-10-30T06:00:00Z', format: null, fileName: null, fetchedAt: '2026-10-23T06:00:00Z', addedAt: '2026-10-23T06:00:00Z' } } as Activity
    const { container } = render(<RunProvenance run={run} />)
    expect(container).toBeEmptyDOMElement()
  })
})
