import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../app/App'
import { AuthContext, type Auth } from '../../app/auth-context'
import type { Activity, ActivitySummary, Runner } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import { server } from '../../test/server'

const TOKEN = 'test-token'
const longRun = longRunFixture as Activity

const thandi: Runner = {
  id: 'runner-1',
  displayName: 'Thandi',
  email: 'thandi@example.com',
  timeZone: 'Africa/Johannesburg',
  units: 'Kilometres',
  weeklyEmails: false,
  consentedAt: '2026-10-08T09:00:00Z',
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
})

/** The runs API, insisting on the bearer token like the real one. */
function runsApi(start: Activity[] = []) {
  const db = { runs: [...start], uploads: [] as { contentType: string; body: string }[] }
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
    http.post('*/api/v1/me/activities', async ({ request }) => {
      if (!authorised(request)) return unauthorised()
      db.uploads.push({ contentType: request.headers.get('Content-Type') ?? '', body: await request.text() })
      db.runs.unshift(longRun)
      return HttpResponse.json(longRun, { status: 201 })
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
    await user.click(await screen.findByRole('button', { name: 'My runs' }))
    expect(await screen.findByText(/No runs yet/)).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Upload a run'), fitFile())

    expect(await screen.findByRole('heading', { name: 'Long run', level: 2 })).toBeInTheDocument()
    expect(db.uploads).toHaveLength(1)
    expect(db.uploads[0]?.contentType).toMatch(/^multipart\/form-data; boundary=/)
    // jsdom files lose their name and bytes on the way into undici; the field itself is what the API binds.
    expect(db.uploads[0]?.body).toContain('name="file"')
    expect(window.location.search).toBe(`?view=runs&run=${longRun.id}`)
  })

  it('shows what was wrong with a file the API couldn’t read', async () => {
    runsApi()
    server.use(
      http.post('*/api/v1/me/activities', () =>
        HttpResponse.json(
          { title: 'One or more fields are invalid.', code: 'validation_failed', errors: { file: ['That isn’t a .fit file. Use Export Original.'] } },
          { status: 400 },
        ),
      ),
    )
    const user = renderApp('/?view=runs')

    await user.upload(await screen.findByLabelText('Upload a run'), fitFile())

    expect(await screen.findByRole('alert')).toHaveTextContent('That isn’t a .fit file. Use Export Original.')
    expect(screen.getByRole('heading', { name: 'My runs' })).toBeInTheDocument()
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

    const term = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent
    await screen.findByRole('heading', { name: 'Long run', level: 2 })
    expect(term('Distance')).toBe('15.4 km')
    expect(term('Moving time')).toBe('1:42:12')
    expect(term('Pace')).toBe('6:40/km')
    expect(term('Elevation gain')).toBe('55 m')
    expect(term('Avg heart rate')).toBe('151 bpm')
    expect(term('Max heart rate')).toBe('163 bpm')
    expect(term('Calories')).toBe('1074')
    expect(screen.queryByText('Elapsed time')).not.toBeInTheDocument()
  })

  it('compares the run with the plan session for that day', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const panel = (await screen.findByRole('heading', { name: 'Against your plan' })).closest('section')!
    expect(within(panel).getByText('Comrades Marathon · Long run')).toBeInTheDocument()
    expect(within(panel).getByText('14 km at 7:21–8:10/km')).toBeInTheDocument()
    expect(within(panel).getByText('15.4 km at 6:40/km')).toBeInTheDocument()
    expect(within(panel).getByText('+1.4 km')).toBeInTheDocument()
    expect(within(panel).getByText(/42 s\/km quicker than planned/)).toBeInTheDocument()
  })

  it('marks the quickest and hardest kilometres and sums up the halves', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(16)
    expect(within(rows[5]!).getByText('Hardest')).toBeInTheDocument()
    expect(within(rows[6]!).getByText('Quickest')).toBeInTheDocument()
    expect(within(rows[15]!).getByRole('rowheader')).toHaveTextContent('0.35')
    expect(screen.getByText('Even halves: nicely paced.')).toBeInTheDocument()
  })

  it('lists best efforts with personal bests flagged', async () => {
    runsApi([longRun])
    renderApp(`/?view=runs&run=${longRun.id}`)

    const efforts = (await screen.findByRole('heading', { name: 'Best efforts' })).closest('section')!
    const fiveK = within(efforts).getByText('5K').closest('li')!
    expect(fiveK).toHaveTextContent('32:47')
    expect(within(fiveK).getByText('PB')).toBeInTheDocument()
    expect(within(efforts).getAllByRole('listitem')).toHaveLength(8)
  })

  it('says so when nothing was planned that day', async () => {
    runsApi([{ ...longRun, plan: null }])
    renderApp(`/?view=runs&run=${longRun.id}`)

    expect(await screen.findByRole('heading', { name: 'Run', level: 2 })).toBeInTheDocument()
    expect(screen.getByText(/No session was planned for this day/)).toBeInTheDocument()
  })

  it('can be deleted, back to the list', async () => {
    const db = runsApi([longRun])
    const user = renderApp(`/?view=runs&run=${longRun.id}`)

    await user.click(await screen.findByRole('button', { name: 'Delete run' }))
    await user.click(screen.getByRole('button', { name: 'Yes, delete this run' }))

    expect(await screen.findByText(/No runs yet/)).toBeInTheDocument()
    expect(db.runs).toHaveLength(0)
  })

  it('shows a clear error for a run that isn’t there', async () => {
    runsApi([])
    renderApp('/?view=runs&run=missing')

    expect(await screen.findByText('We couldn’t load that run.')).toBeInTheDocument()
  })
})
