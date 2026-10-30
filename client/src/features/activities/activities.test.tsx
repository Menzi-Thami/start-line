import { openDisclosure } from '../../test/user-navigation'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { zipSync } from 'fflate'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Activity, ActivitySummary, BulkImportFile, ImportStatus, Runner } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import tempoFixture from '../../test/fixtures/activity-tempo.json'
import { server } from '../../test/server'

const TOKEN = 'test-token'
const longRun = longRunFixture as Activity
const tempo = tempoFixture as Activity

const thandi: Runner = {
  id: 'runner-1',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: false,
  consentedAt: '2026-10-08T09:00:00Z',
  maxHeartRate: null,
  privacyNoticeVersion: '2026-10-21',
  needsPrivacyConsent: false,
  heartRateConsent: true,
  updateEmails: true,
  updateEmailsOffAt: null,
}

const summaryOf = (run: Activity): ActivitySummary => ({
  id: run.id,
  startedAt: run.startedAt,
  localDate: run.localDate,
  kind: run.kind,
  distanceKm: run.distanceKm,
  movingSeconds: run.movingSeconds,
  paceSecondsPerKm: run.paceSecondsPerKm,
  plannedTitle: run.plan?.title ?? null,
  plannedSessionType: run.plan?.sessionType ?? null,
  pace: run.plan?.pace ?? null,
  averageHeartRate: run.averageHeartRate,
  source: run.source,
})

/** The runs API, insisting on the bearer token like the real one. */
function runsApi(start: Activity[] = [], statuses: ImportStatus[] = []) {
  const db = { runs: [...start], uploads: [] as { contentType: string; body: string; files: number }[] }
  let seen = 0
  const authorised = (request: Request) => request.headers.get('Authorization') === `Bearer ${TOKEN}`
  const unauthorised = () => HttpResponse.json({ title: 'Unauthorized' }, { status: 401 })

  server.use(
    http.get('*/api/v1/me', ({ request }) => (authorised(request) ? HttpResponse.json(thandi) : unauthorised())),
    http.get('*/api/v1/me/activities', ({ request }) => (authorised(request) ? HttpResponse.json(db.runs.map(summaryOf)) : unauthorised())),
    http.get('*/api/v1/me/activities/:id', ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      const run = db.runs.find((r) => r.id === params.id)
      return run ? HttpResponse.json(run) : HttpResponse.json({ title: 'Not found.', code: 'not_found' }, { status: 404 })
    }),
    http.post('*/api/v1/me/activities/batch', async ({ request }) => {
      if (!authorised(request)) return unauthorised()
      const body = await request.text()
      // jsdom files lose their names on the way into undici, so the parts are counted, not read.
      const files = body.split('name="files"').length - 1
      db.uploads.push({ contentType: request.headers.get('Content-Type') ?? '', body, files })
      const results: BulkImportFile[] = Array.from({ length: files }, (_, i) => {
        const status = statuses[seen++] ?? 'Imported'
        if (status === 'Imported' && !db.runs.includes(longRun)) db.runs.unshift(longRun)
        return {
          name: `file-${i}`,
          status,
          message: status === 'Unreadable' ? 'That isn’t a .fit file. Use Export Original.' : status === 'Skipped' ? 'Taperday only reads runs.' : null,
          activity: status === 'Imported' ? summaryOf(longRun) : null,
        }
      })
      return HttpResponse.json({ files: results })
    }),
    http.delete('*/api/v1/me/activities/:id', ({ request, params }) => {
      if (!authorised(request)) return unauthorised()
      db.runs = db.runs.filter((r) => r.id !== params.id)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return db
}

const signedIn: Auth = {
  enabled: true,
  loading: false,
  account: { name: 'Thandi', email: 'thandi@example.com' },
  error: null,
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getToken: () => Promise.resolve(TOKEN),
}

function renderApp(path = '/') {
  window.history.replaceState(null, '', path)
  const user = userEvent.setup()
  render(
    <AuthContext.Provider value={signedIn}>
      <App />
    </AuthContext.Provider>,
  )
  return user
}

const fitFile = () => new File([new Uint8Array([14, 16, 0, 0])], 'run.fit', { type: 'application/octet-stream' })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2027, 0, 3, 9, 0))
})

afterEach(() => vi.useRealTimers())

describe('my runs', () => {
  it('uploads a Garmin file and opens the run it read', async () => {
    const db = runsApi()
    const user = renderApp()
    await user.click(await screen.findByRole('button', { name: 'Runs' }))
    expect(await screen.findByText(/No imported runs yet/)).toBeInTheDocument()

    await openDisclosure('Add runs from a file')
    await user.upload(screen.getByLabelText('Upload runs'), fitFile())

    expect(await screen.findByRole('heading', { name: 'Long run', level: 2 })).toBeInTheDocument()
    expect(db.uploads).toHaveLength(1)
    expect(db.uploads[0]?.contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(db.uploads[0]?.files).toBe(1)
    expect(window.location.search).toBe(`?view=runs&run=${longRun.id}`)
  })

  it('shows what was wrong with a single file the API couldn’t read', async () => {
    runsApi([], ['Unreadable'])
    const user = renderApp('/?view=runs')

    await openDisclosure('Add runs from a file')
    await user.upload(await screen.findByLabelText('Upload runs'), fitFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t a .fit file. Use Export Original.')
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument()
  })

  it('takes several files at once and sums up what happened to each', async () => {
    const db = runsApi([], ['Imported', 'Skipped'])
    const user = renderApp('/?view=runs')

    await openDisclosure('Add runs from a file')
    await user.upload(await screen.findByLabelText('Upload runs'), [fitFile(), new File([new Uint8Array(8)], 'ride.fit')])

    expect(await screen.findByText('1 run added.')).toBeInTheDocument()
    expect(screen.getByText(/Also 1 file that wasn’t a run\./)).toBeInTheDocument()
    expect(screen.getByText('Files that weren’t added (1)')).toBeInTheDocument()
    expect(db.uploads.map((u) => u.files)).toEqual([2])
    expect(await screen.findByText('Long run')).toBeInTheDocument()
  })

  it('opens a Garmin account export in the browser and sends only the .fit files', async () => {
    const db = runsApi()
    const user = renderApp('/?view=runs')
    const inner = zipSync({ 'a.fit': new Uint8Array(64).fill(1), 'b.fit': new Uint8Array(64).fill(2) })
    const exported = new File([zipSync({ 'DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip': inner, 'summary.json': new Uint8Array(4) })], 'export.zip')

    await openDisclosure('Add runs from a file')
    await user.upload(await screen.findByLabelText('Upload runs'), exported)

    expect(await screen.findByText('2 runs added.')).toBeInTheDocument()
    expect(db.uploads.map((u) => u.files)).toEqual([2])
  })

  it('lists runs newest first and opens one', async () => {
    runsApi([longRun])
    const user = renderApp('/?view=runs')

    const item = (await screen.findByText('Long run')).closest('li')!
    expect(within(item).getByText(/15\.4 km · 1:42:12 · 6:40\/km/)).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: /Open the run on/ }))

    expect(await screen.findByRole('heading', { name: 'Long run', level: 2 })).toBeInTheDocument()
  })
})

describe('a run', () => {
  it('shows the headline numbers', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    await screen.findByRole('heading', { name: 'Long run', level: 2 })
    const term = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
    expect(term('Distance')).toBe('15.4 km')
    expect(term('Moving time')).toBe('1:42:12')
    expect(term('Pace')).toBe('6:40/km')
    expect(term('Elevation gain')).toBe('55 m')
    expect(term('Avg heart rate')).toBe('151 bpm')
    expect(term('Max heart rate')).toBe('163 bpm')
    expect(term('Calories')).toBe('1074')
    expect(screen.queryByText('Elapsed time')).not.toBeInTheDocument()
  })

  it('leads with a verdict on what the run was for, the plan beside it, and the next session', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const verdict = (await screen.findByRole('heading', { name: 'Long run, but quicker than long-run pace.' })).closest('section')!
    expect(within(verdict).getByText('14 km at 7:21–8:10/km')).toBeInTheDocument()
    expect(within(verdict).getByText('15.4 km at 6:40/km')).toBeInTheDocument()
    expect(within(verdict).getByText('+1.4 km')).toBeInTheDocument()
    expect(within(verdict).getByText(/42 s\/km quicker than the plan’s range/)).toBeInTheDocument()
    expect(within(verdict).getByText(/quicker than your goal pace of 7:00\/km/)).toBeInTheDocument()
    expect(within(verdict).getByText('Next up: Fartlek, Tuesday 5 January 2027. Start it at the slow end of its range.')).toBeInTheDocument()
  })

  it('checks every km against its zone and marks the quickest and hardest', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(16)
    expect(within(rows[0]!).getByText('31 s fast')).toBeInTheDocument()
    expect(within(rows[0]!).getByText('Long')).toBeInTheDocument()
    expect(within(rows[5]!).getByText('Hardest')).toBeInTheDocument()
    expect(within(rows[6]!).getByText('Quickest')).toBeInTheDocument()
    expect(within(rows[15]!).getByRole('rowheader')).toHaveTextContent('0.35')
    expect(screen.getByText(/Even halves: nicely paced\./)).toBeInTheDocument()
  })

  it('splits a tempo into warm-up, work and cool-down, and says it started fast', async () => {
    runsApi([tempo])
    renderApp(`/?view=runs&run=${tempo.id}`)

    expect(await screen.findByRole('heading', { name: 'Tempo run started 14 s/km fast, then settled into range.' })).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]!).getByText('Warm-up')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Work')).toBeInTheDocument()
    expect(within(rows[8]!).getByText('Cool-down')).toBeInTheDocument()
  })

  it('shows heart-rate drift and time in zones from the max heart rate the runner set', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const section = (await screen.findByRole('heading', { name: 'Heart rate' })).closest('section')!
    expect(within(section).getByText(/Heart rate rose 6\.3% against pace/)).toBeInTheDocument()
    expect(within(section).getAllByRole('listitem')).toHaveLength(5)
    expect(within(section).getByText(/max heart rate you set \(188 bpm\)/)).toBeInTheDocument()
  })

  it('asks for a max heart rate instead of guessing zones', async () => {
    runsApi([{ ...longRun, heartRate: { maxHeartRateSetting: null, zones: null } }])
    const user = renderApp(`/?view=runs&run=${longRun.id}`)

    const section = (await screen.findByRole('heading', { name: 'Heart rate' })).closest('section')!
    expect(within(section).getByText(/to see time in heart-rate zones\. We don’t guess it\./)).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'in Account' }))
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument()
  })

  it('puts PBs and near misses up front and keeps the rest one tap away', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const section = (await screen.findByRole('heading', { name: 'Best efforts' })).closest('section')!
    const upFront = section.querySelector<HTMLElement>(':scope > .efforts')!
    expect(within(upFront).getAllByRole('listitem')).toHaveLength(7)
    const fiveK = within(upFront).getByText('5K').closest('li')!
    expect(fiveK).toHaveTextContent('32:47')
    expect(fiveK).toHaveTextContent('best 32:10')
    expect(within(fiveK).getByText('Near PB')).toBeInTheDocument()
    expect(within(within(upFront).getByText('10K').closest('li')!).getByText('PB')).toBeInTheDocument()
    expect(within(section).getByText('All best efforts in this run (8)')).toBeInTheDocument()
  })

  it('says a first run has nothing to beat yet', async () => {
    runsApi([
      {
        ...longRun,
        bestEfforts: longRun.bestEfforts.map((e) => ({ ...e, standing: 'FirstTime' as const, isWorthShowing: false, previousBestSeconds: null })),
      },
    ])
    renderApp(`/?view=runs&run=${longRun.id}`)

    expect(await screen.findByText(/Your first run at these distances, so there’s nothing to beat yet\./)).toBeInTheDocument()
  })

  it('logs an unplanned run without judging it', async () => {
    runsApi([{ ...longRun, plan: null }])
    renderApp(`/?view=runs&run=${longRun.id}`)

    expect(await screen.findByRole('heading', { name: 'Run', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'An extra run, logged.' })).toBeInTheDocument()
  })

  it('can be deleted, back to the list', async () => {
    const db = runsApi([longRun])
    const user = renderApp(`/?view=runs&run=${longRun.id}`)

    await user.click(await screen.findByRole('button', { name: 'Delete run' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete this run' }))

    expect(await screen.findByText(/No imported runs yet/)).toBeInTheDocument()
    expect(db.runs).toHaveLength(0)
  })

  it('shows a clear error for a run that isn’t there', async () => {
    runsApi([])
    renderApp('/?view=runs&run=missing')

    expect(await screen.findByText('We couldn’t load that run.')).toBeInTheDocument()
  })
})
