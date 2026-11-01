import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { Race, Reminders, RunData, StravaStatus, ProgressStory, TrainingInsights, TrainingPlan } from '../lib/types'
import plan from './fixtures/plan-5k.json'
import races from './fixtures/races.json'

// Fixtures are real responses captured from the API, so the UI is tested against the true contract.
export const racesFixture = races as Race[]
export const planFixture = plan as TrainingPlan

/** Strava sync as it is until the Strava app is configured: not offered. */
export const stravaOff: StravaStatus = {
  available: false,
  connected: false,
  status: null,
  includesPrivateRuns: false,
  connectedAt: null,
  lastSyncedAt: null,
  pending: 0,
  failed: 0,
  syncedRuns: 0,
}

/** Reminders as they are until the VAPID keys are configured: not offered. */
export const remindersOff: Reminders = { available: false, publicKey: null, devices: [] }

/** The secret in the runner's personal calendar link, and the one a reset gives. */
export const calendarToken = 'personal-calendar-token-0123456789abcdefghij'
export const newCalendarToken = 'new-calendar-token-0123456789abcdefghijklmn'

/** A runner's run data with nothing to check: no runs, no Strava. */
export const runDataEmpty: RunData = {
  sources: { uploads: 0, fit: 0, gpx: 0, tcx: 0, unknownFormat: 0, strava: 0, stravaConnected: false, stravaStatus: null, lastSyncedAt: null, stravaPending: 0 },
  totals: [],
  missing: { runs: 0, withoutHeartRate: 0, withoutElevation: 0, withoutSplits: 0, heartRateConsent: true },
  syncIssues: [],
}


/** A plan's training trends with too little running to judge: what a new runner sees. */
export const insightsEmpty: TrainingInsights = {
  today: '2026-11-01',
  trends: {
    weeks: Array.from({ length: 8 }, (_, i) => ({ weekStart: new Date(Date.UTC(2026, 8, 7 + i * 7)).toISOString().slice(0, 10), plannedKm: 0, ranKm: 0, stravaKm: 0, runs: 0, unknownDistances: 0, isCurrent: i === 7 })),
    load: { recentKm: 0, baselineWeeklyKm: 0, baselineWeeksRun: 0, changePercent: null, signal: 'NotEnoughHistory' },
    adherence: { planned: 0, done: 0, skipped: 0, unlogged: 0, share: null },
    easyPace: { recentRuns: 0, earlierRuns: 0, recentSecondsPerKm: null, earlierSecondsPerKm: null, changeSecondsPerKm: null, recentHeartRate: null, earlierHeartRate: null },
    gaps: ['FewWeeks', 'FewEasyRuns'],
    nextStep: 'LogMore',
    reasons: ['SparseLogs'],
  },
  decisions: [],
}

/** A plan's progress story with nothing logged yet: what a new runner sees. */
export const progressEmpty: ProgressStory = {
  today: '2026-11-01',
  story: {
    weeks: 4,
    weekRows: Array.from({ length: 4 }, (_, i) => ({ weekStart: new Date(Date.UTC(2026, 9, 12 + i * 7)).toISOString().slice(0, 10), ranKm: 0, plannedKm: 0, runs: 0, longestKm: 0, isCurrent: i === 3 })),
    current: { from: '2026-10-05', to: '2026-11-01', km: 0, runs: 0, averageWeeklyKm: 0, longestKm: 0, weeksRun: 0 },
    previous: { from: '2026-09-07', to: '2026-10-04', km: 0, runs: 0, averageWeeklyKm: 0, longestKm: 0, weeksRun: 0 },
    adherence: { planned: 0, done: 0, skipped: 0, unlogged: 0, share: null },
    easyPace: { recentRuns: 0, earlierRuns: 0, recentSecondsPerKm: null, earlierSecondsPerKm: null, changeSecondsPerKm: null, recentHeartRate: null, earlierHeartRate: null },
    bests: [],
    raceGoal: null,
    gaps: ['FewWeeks', 'NoBaseline'],
  },
}

export const lastPlanRequest: { body: unknown } = { body: undefined }

export const handlers = [
  // The waiting screen follows the wake through these; an awake server answers both at once.
  http.get('*/health/live', () => new HttpResponse('Healthy')),
  http.get('*/health/ready', () => new HttpResponse('Healthy')),
  http.get('*/api/v1/races', () => HttpResponse.json(racesFixture)),
  http.get('*/api/v1/me/run-data', () => HttpResponse.json(runDataEmpty)),
  http.get('*/api/v1/me/plans/:id/insights', () => HttpResponse.json(insightsEmpty)),
  http.get('*/api/v1/me/plans/:id/progress', () => HttpResponse.json(progressEmpty)),
  http.get('*/api/v1/me/shoes', () => HttpResponse.json([])),
  http.get('*/api/v1/me/shoes/unworn-runs', () => HttpResponse.json([])),
  http.post('*/api/v1/plans', async ({ request }) => {
    lastPlanRequest.body = await request.json()
    return HttpResponse.json(planFixture)
  }),
  // Signed-in views list uploaded runs; none by default. Tests that need runs override this.
  http.get('*/api/v1/me/activities', () => HttpResponse.json([])),
  http.get('*/api/v1/me/activities/bests', () => HttpResponse.json([])),
  // The runs behind Home's long-term totals (ticks and uploads); none by default.
  http.get('*/api/v1/me/running', () => HttpResponse.json([])),
  http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(stravaOff)),
  // A saved plan's check-ins; none by default.
  http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([])),
  http.get('*/api/v1/me/reminders', () => HttpResponse.json(remindersOff)),
  // The runner's personal calendar link, and a new one when it's reset.
  http.get('*/api/v1/me/calendar', () => HttpResponse.json({ token: calendarToken })),
  http.post('*/api/v1/me/calendar/reset', () => HttpResponse.json({ token: newCalendarToken })),
  // No picture by default: the app shows initials.
  http.get('*/api/v1/me/photo', () => new HttpResponse(null, { status: 204 })),
  http.get('*/api/v1/predictions', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({ distanceKm: Number(url.searchParams.get('toKm')), predictedTime: '01:51:20', paceSecondsPerKm: 316.6 })
  }),
]

export const server = setupServer(...handlers)
