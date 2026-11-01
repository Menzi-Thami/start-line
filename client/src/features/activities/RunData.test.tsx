import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { Activity, ActivitySummary, RunData } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import { server } from '../../test/server'
import { RunDataPanel } from './RunDataPanel'
import { RunProvenance } from './RunProvenance'

const TOKEN = 'test-token'
const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve(TOKEN) }
const longRun = longRunFixture as Activity

const run = (id: string, localDate: string, km: number, kind: 'Upload' | 'Strava', fileName: string | null = null): ActivitySummary => ({
  id,
  startedAt: `${localDate}T04:00:00Z`,
  localDate,
  kind: 'Run',
  distanceKm: km,
  movingSeconds: km * 330,
  paceSecondsPerKm: 330,
  plannedTitle: null,
  plannedSessionType: null,
  pace: null,
  averageHeartRate: null,
  source: { kind, viewUrl: null, recordedOnGarmin: false, cachedUntil: null, format: kind === 'Upload' ? 'Fit' : null, fileName, fetchedAt: null, addedAt: null },
})

const fileRun = run('a', '2026-10-28', 10, 'Upload', 'morning.fit')
const stravaRun = run('b', '2026-10-28', 10, 'Strava')

function data(overrides: Partial<RunData> = {}): RunData {
  return {
    sources: { uploads: 1, fit: 1, gpx: 0, tcx: 0, unknownFormat: 0, strava: 1, stravaConnected: true, stravaStatus: 'Active', lastSyncedAt: '2026-10-28T06:00:00Z', stravaPending: 0 },
    totals: [
      { period: 'week', from: '2026-10-26', to: '2026-10-28', totalKm: 14, runs: 2, tickedKm: 4, tickedRuns: 1, uploadedKm: 10, uploadedRuns: 1, stravaKm: 0, stravaRuns: 0, withoutDistance: 0 },
      { period: 'month', from: '2026-10-01', to: '2026-10-28', totalKm: 52.5, runs: 7, tickedKm: 12.5, tickedRuns: 3, uploadedKm: 30, uploadedRuns: 3, stravaKm: 10, stravaRuns: 1, withoutDistance: 1 },
    ],
    possibleDuplicates: [{ first: fileRun, second: stravaRun, relation: 'SameRun' }],
    missing: { runs: 2, withoutHeartRate: 2, withoutElevation: 0, withoutSplits: 0, heartRateConsent: false },
    syncIssues: [
      { stravaActivityId: 123, reason: 'Strava answered 503', skipped: false, at: '2026-10-27T06:00:00Z' },
      { stravaActivityId: 456, reason: 'That run is too short to show.', skipped: true, at: '2026-10-26T06:00:00Z' },
    ],
    ...overrides,
  }
}

function renderPanel(onChanged = vi.fn()) {
  render(
    <AuthContext.Provider value={auth}>
      <RunDataPanel units="km" onOpen={vi.fn()} onChanged={onChanged} />
    </AuthContext.Provider>,
  )
  return onChanged
}

async function openPanel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText(/Your run data/))
}

describe('Your run data', () => {
  it('flags what needs checking and explains where each total comes from', async () => {
    server.use(http.get('*/api/v1/me/run-data', () => HttpResponse.json(data())))
    const user = userEvent.setup()
    renderPanel()

    expect(await screen.findByText('· 2 things to check')).toBeInTheDocument()
    await openPanel(user)
    const week = screen.getByRole('table', { name: 'This week: where the total comes from' })
    expect(within(week).getByRole('rowheader', { name: 'Checked in by you' })).toBeInTheDocument()
    expect(within(week).getByRole('rowheader', { name: 'Uploaded files' })).toBeInTheDocument()
    expect(within(week).queryByRole('rowheader', { name: 'From Strava' })).not.toBeInTheDocument()
    expect(screen.getByText('1 run counted without a distance: ticked off with no distance and no linked run.')).toBeInTheDocument()
    expect(screen.getByText(/1 FIT/)).toBeInTheDocument()
    expect(screen.getByText(/you haven’t allowed Taperday to keep heart rate/)).toBeInTheDocument()
    expect(screen.getByText(/That run is too short to show\./)).toBeInTheDocument()
  })

  it('deletes the copy the runner picks, then reloads', async () => {
    let current = data()
    const deleted: string[][] = []
    server.use(
      http.get('*/api/v1/me/run-data', () => HttpResponse.json(current)),
      http.post('*/api/v1/me/run-data/delete', async ({ request }) => {
        const body = (await request.json()) as { activityIds: string[] }
        deleted.push(body.activityIds)
        current = data({ possibleDuplicates: [] })
        return HttpResponse.json({ deleted: body.activityIds.length })
      }),
    )
    const user = userEvent.setup()
    const onChanged = renderPanel()
    await openPanel(user)

    const pair = await screen.findByText('Looks like the same run twice')
    const stravaLine = within(pair.closest('li')!).getByText(/Strava$/).closest('div')!
    await user.click(within(stravaLine).getByRole('button', { name: 'Delete this one' }))

    expect(deleted).toEqual([['b']])
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Deleted the')
    expect(screen.queryByText('Looks like the same run twice')).not.toBeInTheDocument()
  })

  it('keeps both runs of a pair when the runner says they are different', async () => {
    let current = data()
    let kept: unknown
    server.use(
      http.get('*/api/v1/me/run-data', () => HttpResponse.json(current)),
      http.post('*/api/v1/me/run-data/keep-both', async ({ request }) => {
        kept = await request.json()
        current = data({ possibleDuplicates: [] })
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderPanel()
    await openPanel(user)

    await user.click(await screen.findByRole('button', { name: 'Keep both' }))

    expect(kept).toEqual({ firstActivityId: 'a', secondActivityId: 'b' })
    expect(await screen.findByText('Kept both. Taperday won’t ask about these two again.')).toBeInTheDocument()
  })

  it('retries runs that failed to arrive from Strava, and only offers it for failures', async () => {
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
    await openPanel(user)

    await user.click(await screen.findByRole('button', { name: 'Try it again' }))

    expect(retried).toBe(1)
    expect(await screen.findByText('Trying 1 run from Strava again.')).toBeInTheDocument()
  })

  it('shows an error with a way to try again', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/me/run-data', () => (++calls === 1 ? HttpResponse.json({ title: 'Down' }, { status: 500 }) : HttpResponse.json(data()))))
    const user = userEvent.setup()
    renderPanel()
    await openPanel(user)

    await user.click(await screen.findByRole('button', { name: 'Try again' }))

    expect(await screen.findByText('What your totals are made of')).toBeInTheDocument()
  })
})

describe('Where this run came from', () => {
  it('names the uploaded file and explains each gap', () => {
    const run = { ...longRun, averageHeartRate: null, heartRate: null, elevationGainMetres: null, source: { kind: 'Upload', viewUrl: null, recordedOnGarmin: false, cachedUntil: null, format: 'Gpx', fileName: 'Sunday long.gpx', fetchedAt: null, addedAt: '2026-10-20T08:00:00Z' } } as Activity
    render(<RunProvenance run={run} />)

    expect(screen.getByText(/Where this run came from · 2 gaps/)).toBeInTheDocument()
    expect(screen.getByText(/Uploaded from a GPX file/)).toBeInTheDocument()
    expect(screen.getByText('Sunday long.gpx')).toBeInTheDocument()
    expect(screen.getByText(/No heart rate/)).toBeInTheDocument()
    expect(screen.getByText(/No elevation/)).toBeInTheDocument()
  })

  it('says how long a Strava copy is kept, and why', () => {
    const run = { ...longRun, source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/1', recordedOnGarmin: true, cachedUntil: '2026-10-30T06:00:00Z', format: null, fileName: null, fetchedAt: '2026-10-23T06:00:00Z', addedAt: '2026-10-23T06:00:00Z' } } as Activity
    render(<RunProvenance run={run} />)

    expect(screen.getByText('Synced from Strava, recorded on Garmin')).toBeInTheDocument()
    expect(screen.getByText(/Strava’s rules let apps hold a run for 7 days/)).toBeInTheDocument()
  })
})
