import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { CheckIn, CheckInRequest, SyncedCompletion } from '../src/lib/types'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

// The fixture's today is Sunday 18 October: a 6 km long run. Strava has a 4.1 km run for it.
const longRun: SyncedCompletion = {
  date: '2026-10-18', sessionType: 'LongRun', activityId: 'synthetic-strava', state: 'Completed', measure: 'Distance', plannedKm: 6, actualKm: 4.1,
  plannedSeconds: 0, actualSeconds: 1476, feedback: 'Shorter', cachedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
}

/** Synthetic API: completions are worked out from what the "server" holds, as the real one does on each read. */
async function api(page: Page) {
  const state = { entries: [] as CheckIn[], held: true, writes: [] as CheckInRequest[] }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path.endsWith('/coach')) data = { id: 'visibility-plan', plan, coaching: [] }
    else if (path.endsWith('/strava-completions')) data = state.held && !state.entries.some(c => c.date === longRun.date) ? [longRun] : []
    else if (path.includes('/check-ins')) {
      if (request.method() === 'PUT') {
        const parts = path.split('/')
        const body = request.postDataJSON() as CheckInRequest
        state.writes.push(body)
        const saved = { ...body, date: parts.at(-2), sessionType: parts.at(-1), pain: 'None', isAdditional: false, updatedAt: '2026-10-18T12:00:00Z' } as CheckIn
        state.entries = [...state.entries.filter(c => c.date !== saved.date), saved]
        data = saved
      } else data = state.entries
    }
    await route.fulfill({ json: data })
  })
  return state
}

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  for (const box of await page.locator('.strava-completion').all()) {
    const bounds = await box.boundingBox()
    if (bounds) expect(bounds.x + bounds.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth) + 1)
  }
}

test('a held Strava run completes today’s session, fits small phones, lapses, and can be kept as the runner’s tick @phone', async ({ page }, info) => {
  const state = await api(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-18&km=4.1')

  const today = page.getByRole('region', { name: 'Today', exact: true })
  await expect(today.getByText('Completed via Strava', { exact: true })).toBeVisible()
  await expect(today.locator('.home-done-chip')).toHaveText('Done')
  await expect(today.locator('.strava-completion-figures')).toHaveText('Planned 6 km · Ran 4.1 km')
  await expect(today.getByText(/You got out there — that counts\. You ran 4\.1 km of your planned 6 km today\./)).toBeVisible()
  expect(state.writes).toEqual([])

  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await noSidewaysScroll(page)
    if (width < 400) await today.screenshot({ path: info.outputPath(`strava-completion-today-${width}.png`) })
  }

  // The calendar marks it done "via Strava" too, and the open day still fits a 320 px phone.
  await page.setViewportSize({ width: 320, height: 900 })
  await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
  const day = page.getByRole('button', { name: /^Sunday 18 October 2026: Long run, done/ })
  await expect(day).toBeVisible()
  await day.click()
  const summary = page.getByRole('region', { name: 'Sunday 18 October 2026', exact: true })
  await expect(summary.getByText('Completed via Strava', { exact: true }).first()).toBeVisible()
  await noSidewaysScroll(page)
  await summary.screenshot({ path: info.outputPath('strava-completion-day-320.png') })
  await page.getByRole('button', { name: 'Return home', exact: true }).click()

  // The copy lapses: the session is no longer done, and nothing was ever written.
  state.held = false
  await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
  await expect(today.getByText('Completed via Strava', { exact: true })).toHaveCount(0)
  await expect(today.locator('.home-done-chip')).toHaveCount(0)
  expect(state.writes).toEqual([])

  // Fetched again on the next visit; the runner keeps the tick, which outlasts the copy.
  state.held = true
  await page.reload()
  await expect(today.getByText('Completed via Strava', { exact: true })).toBeVisible()
  await today.getByRole('button', { name: 'Keep this tick', exact: true }).click()
  await expect(today.getByRole('button', { name: 'Change how Long run went', exact: true })).toBeVisible()
  expect(state.writes).toEqual([{ status: 'Done', effort: null, distanceUnreported: false }])
  state.held = false
  await page.reload()
  await expect(today.locator('.home-done-chip')).toHaveText('Done')
  await expect(today.getByText('Completed via Strava', { exact: true })).toHaveCount(0)
})
