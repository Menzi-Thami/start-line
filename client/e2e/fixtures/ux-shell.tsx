// The whole signed-in App, as a runner sees it, over a synthetic in-page API.
// Used for the UX redesign's before/after screenshots (docs/ux/screenshots). Test-only: never shipped.
import './app-styles'
import { createRoot } from 'react-dom/client'
import { App } from '../../src/app/App'
import { AuthContext, accountsOff, type Auth } from '../../src/app/auth-context'
import plan from '../../src/test/fixtures/plan-5k.json'
import races from '../../src/test/fixtures/races.json'
import longRun from '../../src/test/fixtures/activity-long-run.json'
import tempo from '../../src/test/fixtures/activity-tempo.json'

const query = new URLSearchParams(location.search)
const signedOut = query.get('auth') === 'out'
const noPlan = query.get('plan') === 'none'

const runner = {
  id: 'qa-runner', displayName: 'Thandi', email: 'qa@example.test', timeZone: 'Europe/London', units: 'Kilometres',
  weeklyEmails: false, consentedAt: '2026-10-08T09:00:00Z', maxHeartRate: null, privacyNoticeVersion: '2026-10-21',
  needsPrivacyConsent: false, heartRateConsent: true, updateEmails: false, updateEmailsOffAt: null,
}
const inputs = {
  raceSlug: null, raceName: 'Parkrun PB', distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30',
  runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', currentWeeklyKm: null,
  experience: 'Regular', strengthDays: [], planFrom: '2026-10-08',
}
const summary = { id: 'plan-1', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }
const saved = { id: 'plan-1', name: 'Parkrun PB', createdAt: '2026-10-08T09:00:00Z', inputs, status: 'Active', plan, coaching: [] }
const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10)
const runs = [
  { ...tempo, id: 'run-tempo', localDate: day(1), startedAt: `${day(1)}T06:30:00+00:00` },
  { ...longRun, id: 'run-long', localDate: day(4), startedAt: `${day(4)}T07:10:00+00:00` },
]
const strava = { available: true, connected: true, status: 'Active', includesPrivateRuns: false, connectedAt: '2026-10-20T08:00:00Z', lastSyncedAt: new Date().toISOString(), pending: 0, failed: 0, syncedRuns: 2 }
const weeks = (n: number) => Array.from({ length: n }, (_, i) => ({ weekStart: day((n - 1 - i) * 7), plannedKm: 20, ranKm: 14 + i, stravaKm: 10, runs: 3, unknownDistances: 0, longestKm: 8, isCurrent: i === n - 1 }))

type Route = [method: string, pattern: RegExp, body: () => unknown, status?: number]
const routes: Route[] = [
  ['GET', /\/health\//, () => 'Healthy'],
  ['GET', /\/api\/v1\/races$/, () => races],
  ['GET', /\/api\/v1\/races\/search$/, () => [
    { slug: 'knysna-forest-marathon-2027', name: 'Knysna Forest Marathon', date: '2027-07-03', distanceKm: 42.195, location: 'Knysna', summary: '', website: null, dateStatus: 'Confirmed', distanceConfirmed: true, major: false },
    { slug: 'loskop-marathon-2027', name: 'Loskop Marathon', date: '2027-04-24', distanceKm: 50, location: 'Loskop Dam', summary: '', website: null, dateStatus: 'Provisional', distanceConfirmed: true, major: false },
  ]],
  ['GET', /\/api\/v1\/me$/, () => runner],
  ['GET', /\/api\/v1\/me\/plans$/, () => (noPlan ? [] : [summary])],
  ['POST', /\/api\/v1\/me\/plans\/[^/]+\/coach$/, () => saved],
  ['GET', /\/api\/v1\/me\/plans\/[^/]+\/insights$/, () => ({ today: day(0), trends: { weeks: weeks(8), load: { recentKm: 18, baselineWeeklyKm: 16, baselineWeeksRun: 4, changePercent: 12, signal: 'Steady' }, adherence: { planned: 12, done: 10, skipped: 1, unlogged: 1, share: 0.83 }, easyPace: { recentRuns: 3, earlierRuns: 3, recentSecondsPerKm: 400, earlierSecondsPerKm: 410, changeSecondsPerKm: -10, recentHeartRate: null, earlierHeartRate: null }, gaps: [], nextStep: 'KeepGoing', reasons: [] }, decisions: [] })],
  ['GET', /\/api\/v1\/me\/plans\/[^/]+\/progress$/, () => ({ today: day(0), story: { weeks: 4, weekRows: weeks(4), current: { from: day(27), to: day(0), km: 62, runs: 11, averageWeeklyKm: 15.5, longestKm: 15.35, weeksRun: 4 }, previous: { from: day(55), to: day(28), km: 48, runs: 9, averageWeeklyKm: 12, longestKm: 10, weeksRun: 4 }, adherence: { planned: 12, done: 10, skipped: 1, unlogged: 1, share: 0.83 }, easyPace: { recentRuns: 3, earlierRuns: 3, recentSecondsPerKm: 400, earlierSecondsPerKm: 410, changeSecondsPerKm: -10, recentHeartRate: null, earlierHeartRate: null }, bests: [], raceGoal: null, gaps: [] } })],
  ['GET', /\/api\/v1\/me\/plans\/[^/]+\/(check-ins|strava-completions)$/, () => []],
  ['GET', /\/api\/v1\/me\/plans\/[^/]+$/, () => saved],
  ['GET', /\/api\/v1\/me\/activities$/, () => runs],
  ['GET', /\/api\/v1\/me\/activities\/bests$/, () => []],
  ['GET', /\/api\/v1\/me\/activities\/[^/]+$/, () => runs[0]],
  ['GET', /\/api\/v1\/me\/running/, () => runs.map((r) => ({ date: r.localDate, km: r.distanceKm, source: 'Upload' }))],
  ['GET', /\/api\/v1\/me\/sync\/strava$/, () => strava],
  ['GET', /\/api\/v1\/me\/run-data$/, () => ({ sources: { uploads: 0, fit: 0, gpx: 0, tcx: 0, unknownFormat: 0, strava: 2, stravaConnected: true, stravaStatus: 'Connected', lastSyncedAt: strava.lastSyncedAt, stravaPending: 0 }, totals: [], missing: { runs: 0, withoutHeartRate: 0, withoutElevation: 0, withoutSplits: 0, heartRateConsent: true }, syncIssues: [] })],
  ['GET', /\/api\/v1\/me\/(readiness|shoes|shoes\/unworn-runs)$/, () => []],
  ['GET', /\/api\/v1\/me\/reminders$/, () => ({ available: true, publicKey: null, devices: [] })],
  ['GET', /\/api\/v1\/me\/calendar$/, () => ({ token: 'qa-calendar-token-0123456789abcdefghijklmn' })],
  ['GET', /\/api\/v1\/me\/photo$/, () => null, 204],
  ['POST', /\/api\/v1\/plans$/, () => plan],
  ['GET', /\/api\/v1\/predictions/, () => ({ distanceKm: 5, predictedTime: '00:24:30', paceSecondsPerKm: 294 })],
]

const realFetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init)
  const path = new URL(request.url).pathname
  const route = routes.find(([method, pattern]) => method === request.method && pattern.test(path))
  if (!route) return request.url.includes('/api/') ? new Response(null, { status: 204 }) : realFetch(input, init)
  const [, , body, status = 200] = route
  if (status === 204) return new Response(null, { status })
  const value = body()
  return typeof value === 'string' ? new Response(value, { status }) : Response.json(value, { status })
}

const auth: Auth = signedOut
  ? { ...accountsOff, enabled: true }
  : { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'qa@example.test' }, getToken: () => Promise.resolve('synthetic-token') }

createRoot(document.getElementById('root')!).render(<AuthContext.Provider value={auth}><App /></AuthContext.Provider>)
