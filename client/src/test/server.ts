import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { Race, Reminders, StravaStatus, TrainingPlan } from '../lib/types'
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

export const lastPlanRequest: { body: unknown } = { body: undefined }

export const handlers = [
  // The waiting screen follows the wake through these; an awake server answers both at once.
  http.get('*/health/live', () => new HttpResponse('Healthy')),
  http.get('*/health/ready', () => new HttpResponse('Healthy')),
  http.get('*/api/v1/races', () => HttpResponse.json(racesFixture)),
  http.post('*/api/v1/plans', async ({ request }) => {
    lastPlanRequest.body = await request.json()
    return HttpResponse.json(planFixture)
  }),
  // Signed-in views list uploaded runs; none by default. Tests that need runs override this.
  http.get('*/api/v1/me/activities', () => HttpResponse.json([])),
  http.get('*/api/v1/me/activities/bests', () => HttpResponse.json([])),
  http.get('*/api/v1/me/sync/strava', () => HttpResponse.json(stravaOff)),
  // A saved plan's check-ins; none by default.
  http.get('*/api/v1/me/plans/:id/check-ins', () => HttpResponse.json([])),
  http.get('*/api/v1/me/reminders', () => HttpResponse.json(remindersOff)),
  http.get('*/api/v1/predictions', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({ distanceKm: Number(url.searchParams.get('toKm')), predictedTime: '01:51:20', paceSecondsPerKm: 316.6 })
  }),
]

export const server = setupServer(...handlers)
