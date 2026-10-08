import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import type { Race, TrainingPlan } from '../lib/types'
import plan from './fixtures/plan-5k.json'
import races from './fixtures/races.json'

// Fixtures are real responses captured from the API, so the UI is tested against the true contract.
export const racesFixture = races as Race[]
export const planFixture = plan as TrainingPlan

export const lastPlanRequest: { body: unknown } = { body: undefined }

export const handlers = [
  http.get('*/api/v1/races', () => HttpResponse.json(racesFixture)),
  http.post('*/api/v1/plans', async ({ request }) => {
    lastPlanRequest.body = await request.json()
    return HttpResponse.json(planFixture)
  }),
  http.get('*/api/v1/predictions', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json({ distanceKm: Number(url.searchParams.get('toKm')), predictedTime: '01:51:20', paceSecondsPerKm: 316.6 })
  }),
]

export const server = setupServer(...handlers)
