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
    http.get('*/api/v1/me/plans', ({ request }) => (authorised(request) ? HttpResponse.json([]) : unauthorised())),
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

/** Opens the one Add runs button, where Strava sync and file uploads live. */
async function openAddRuns(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: 'Add runs' })
  if (button.getAttribute('aria-expanded') !== 'true') await user.click(button)
  return screen.getByRole('region', { name: 'Add runs' })
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
    expect(await screen.findByText(/Use Add runs to bring in runs from Strava or a file/)).toBeInTheDocument()

    await openAddRuns(user)
    await user.upload(screen.getByLabelText('Upload runs'), fitFile())

    expect(await screen.findByRole('heading', { name: 'Long run', level: 2 }, { timeout: 10000 })).toBeInTheDocument()
    expect(db.uploads).toHaveLength(1)
    expect(db.uploads[0]?.contentType).toMatch(/^multipart\/form-data; boundary=/)
    expect(db.uploads[0]?.files).toBe(1)
    const location = new URLSearchParams(window.location.search)
    expect(location.get('view')).toBe('runs')
    expect(location.get('run')).toBe(longRun.id)
    expect(location.get('returnTo')).toBe('?view=runs')
  })

  it('keeps Strava sync and file uploads behind one Add runs button, closed until asked for', async () => {
    runsApi([longRun])
    const user = renderApp('/?view=runs')
    await screen.findByText('Long run')
    const button = screen.getByRole('button', { name: 'Add runs' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('region', { name: 'Add runs' })).not.toBeInTheDocument()
    expect(screen.queryByText('Your run data')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Running insights' })).not.toBeInTheDocument()
    const sheet = await openAddRuns(user)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(within(sheet).getByRole('heading', { name: 'Sync from your phone or watch' })).toBeVisible()
    expect(within(sheet).getByRole('heading', { name: 'Upload a file' })).toBeVisible()
    const guide = within(sheet).getByText('How to get a file from your watch or app').closest('details')!
    expect(guide).not.toHaveAttribute('open')
    await user.click(within(sheet).getByText('How to get a file from your watch or app'))
    expect(within(guide).getByText('Garmin')).toBeVisible()
    await user.click(button)
    expect(screen.queryByRole('region', { name: 'Add runs' })).not.toBeInTheDocument()
  })

  it('takes a Nike runner from Add runs to phone guidance and the real connection settings', async () => {
    const db = runsApi()
    server.use(http.get('*/api/v1/me/sync/strava', () => HttpResponse.json({ available: true, connected: false })))
    const user = renderApp('/?view=runs')
    const sheet = await openAddRuns(user)
    const phone = within(sheet).getByRole('heading', { name: 'Sync from your phone or watch' }).closest('section')!
    expect(within(phone).getByText('A free Strava account is enough.')).toBeVisible()
    expect(within(phone).getByRole('img', { name: 'Powered by Strava' })).toBeVisible()
    const help = within(phone).getByText('Help connecting my app or watch').closest('details')!
    expect(help).not.toHaveAttribute('open')
    await user.click(within(phone).getByText('Help connecting my app or watch'))
    await user.click(within(phone).getByText('Nike Run Club', { exact: true }))
    expect(within(phone).getByText(/Settings → Partners → Strava/)).toBeVisible()
    expect(within(phone).getByText(/Only runs recorded after linking Nike to Strava will sync/)).toBeVisible()
    expect(within(phone).queryByRole('button', { name: 'Open my training plan' })).not.toBeInTheDocument()
    expect(db.uploads).toHaveLength(0)

    await user.click(within(phone).getByRole('button', { name: 'Open connection settings' }))
    expect(window.location.search).toBe('?view=account&settings=connections')
    expect(await screen.findByRole('button', { name: 'Connect with Strava' })).toBeVisible()
    expect(screen.getByText('Connections & run sources').closest('details')).toHaveAttribute('open')
  })

  it('filters the journal by source when runs come from both Strava and uploads', async () => {
    const fromStrava = { ...tempo, id: 'strava-tempo', source: { ...tempo.source, kind: 'Strava' } } as Activity
    const uploaded = { ...longRun, source: { ...longRun.source, kind: 'Upload' } } as Activity
    runsApi([uploaded, fromStrava])
    const user = renderApp('/?view=runs')
    const filter = await screen.findByRole('button', { name: 'Filter' })
    expect(screen.queryByRole('group', { name: 'Show runs by source' })).not.toBeInTheDocument()
    await user.click(filter)
    const sources = screen.getByRole('group', { name: 'Show runs by source' })
    expect(screen.getAllByText(/Matched to your plan|Not matched to a planned session/).length).toBe(2)
    await user.click(within(sources).getByRole('button', { name: 'Strava' }))
    expect(screen.getAllByText('From Strava')).toHaveLength(1)
    expect(screen.queryByText('Uploaded recording')).toBeNull()
    await user.click(within(sources).getByRole('button', { name: 'Uploads' }))
    expect(screen.queryByText('From Strava')).toBeNull()
    expect(screen.getAllByText('Uploaded recording')).toHaveLength(1)
    await user.click(filter)
    expect(screen.getByRole('button', { name: 'Filter: Uploads' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows what was wrong with a single file the API couldn’t read', async () => {
    runsApi([], ['Unreadable'])
    const user = renderApp('/?view=runs')

    await openAddRuns(user)
    await user.upload(await screen.findByLabelText('Upload runs'), fitFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t a .fit file. Use Export Original.')
    expect(screen.getByRole('heading', { name: 'Runs' })).toBeInTheDocument()
  })

  it('takes several files at once and sums up what happened to each', async () => {
    const db = runsApi([], ['Imported', 'Skipped'])
    const user = renderApp('/?view=runs')

    await openAddRuns(user)
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

    await openAddRuns(user)
    await user.upload(await screen.findByLabelText('Upload runs'), exported)

    expect(await screen.findByText('2 runs added.')).toBeInTheDocument()
    expect(db.uploads.map((u) => u.files)).toEqual([2])
  })

  it('lists runs newest first and opens one', async () => {
    runsApi([longRun])
    const user = renderApp('/?view=runs')

    const item = (await screen.findByText('Long run')).closest('li')!
    expect(within(item).getByText('15.4 km')).toBeInTheDocument()
    expect(within(item).getByText(/1:42:12 · 6:40\/km/)).toBeInTheDocument()
    await user.click(within(item).getByRole('button', { name: /Run analysis/ }))

    expect(await screen.findByRole('heading', { name: 'Long run', level: 2 })).toBeInTheDocument()
  })
})

describe('a run', () => {
  it('shows the headline numbers on one scroll, without tabs or a repeated list of stats', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    await screen.findByRole('heading', { name: 'Long run', level: 2 })
    const summary = screen.getByRole('region', { name: 'Run summary' })
    expect(summary).toHaveTextContent('15.4 km')
    expect(summary).toHaveTextContent('Moving time1:42:12')
    expect(summary).toHaveTextContent('Elapsed time1:42:12')
    expect(summary).toHaveTextContent('Elevation gain55 m')
    expect(summary).toHaveTextContent('6:40/km')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { name: 'Plan vs actual' })).toHaveLength(1)
    expect(screen.queryByText('Detailed zone and split evidence')).not.toBeInTheDocument()
    expect(screen.queryByText(/drift|provenance/i)).not.toBeInTheDocument()
    for (const name of ['Your pace splits', 'Heart rate', 'Best efforts', 'Delete this run']) expect(screen.getByRole('heading', { name })).toBeVisible()
  })

  it('says where an upload came from in one line', async () => {
    runsApi([{ ...longRun, source: { ...longRun.source, kind: 'Upload', format: 'Gpx', addedAt: '2026-10-20T08:00:00Z' } } as Activity])
    renderApp(`/?view=runs&run=${longRun.id}`)
    expect(await screen.findByText('Uploaded from a GPX file · 20 Oct')).toBeInTheDocument()
  })

  it('says a Strava run is kept for 7 days and links back to Strava', async () => {
    const fromStrava = { ...longRun, source: { ...longRun.source, kind: 'Strava', viewUrl: 'https://www.strava.com/activities/1', cachedUntil: '2027-01-08T06:00:00Z' } } as Activity
    runsApi([fromStrava])
    renderApp(`/?view=runs&run=${longRun.id}`)
    expect(await screen.findByText('From Strava · kept for 7 days')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Powered by Strava' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Removing this run' })).toBeInTheDocument()
  })

  it('says how the run went against the plan once, with the next session', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const card = (await screen.findByRole('heading', { name: 'Plan vs actual' })).closest('section')!
    expect(within(card).getByText('Long run, but quicker than long-run pace.')).toBeInTheDocument()
    expect(within(card).getByText('14 km at 7:21–8:10/km')).toBeInTheDocument()
    expect(within(card).getByText('15.4 km at 6:40/km')).toBeInTheDocument()
    expect(within(card).getByText('+1.4 km')).toBeInTheDocument()
    expect(within(card).getByText(/42 s\/km quicker than the plan’s range/)).toBeInTheDocument()
    expect(within(card).getByText(/quicker than your goal pace of 7:00\/km/)).toBeInTheDocument()
    expect(within(card).getByText('Next up: Fartlek, Tuesday 5 January 2027. Start it at the slow end of its range.')).toBeInTheDocument()
  })

  it('shows every split at its real distance, the final partial one included, with one short caveat', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const splits = (await screen.findByRole('heading', { name: 'Your pace splits' })).closest('section')!
    expect(within(splits).getAllByRole('button')).toHaveLength(16)
    expect(within(splits).getByRole('button', { name: /0\.35.*partial split/ })).toBeInTheDocument()
    expect(screen.getByText(/Even halves: nicely paced\. Splits show the pace you recorded, not whether each rep was done\./)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Recorded split pace profile' })).toBeInTheDocument()
  })

  it('says a tempo started fast', async () => {
    runsApi([tempo])
    renderApp(`/?view=runs&run=${tempo.id}`)
    expect(await screen.findByText('Tempo run started 14 s/km fast, then settled into range.')).toBeInTheDocument()
  })

  it('shows time in zones from the max heart rate the runner set', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const section = (await screen.findByRole('heading', { name: 'Heart rate' })).closest('section')!
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
    const summary = screen.getByRole('region', { name: 'Run summary' })
    expect(summary).toHaveTextContent('Run recorded')
    expect(screen.queryByRole('heading', { name: 'Plan vs actual' })).not.toBeInTheDocument()
    expect(screen.queryByText(/missed|behind target|failed/i)).not.toBeInTheDocument()
  })

  it('can be deleted, back to the list', async () => {
    const db = runsApi([longRun])
    const user = renderApp(`/?view=runs&run=${longRun.id}`)

    await user.click(await screen.findByRole('button', { name: 'Delete run' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete this run' }))

    expect(await screen.findByText(/Use Add runs to bring in runs from Strava or a file/)).toBeInTheDocument()
    expect(db.runs).toHaveLength(0)
  })

  it('shows a clear error for a run that isn’t there', async () => {
    runsApi([])
    renderApp('/?view=runs&run=missing')

    expect(await screen.findByText('We couldn’t load that run.')).toBeInTheDocument()
  })
})
