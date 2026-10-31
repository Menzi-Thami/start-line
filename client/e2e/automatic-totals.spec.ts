import { openSyncedRuns, openRecentRun } from './navigation'
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { CheckIn, CheckInRequest } from '../src/lib/types'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

async function history(page: Page) {
  const state = { entries: [] as CheckIn[], available: true, distance: 10, writes: 0 }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path.endsWith('/coach')) data = { id: 'visibility-plan', plan, coaching: [] }
    else if (path.includes('/check-ins')) {
      if (request.method() === 'PUT') {
        const parts = path.split('/')
        const body = request.postDataJSON() as CheckInRequest
        const saved = { ...body, id: parts.at(-3), date: parts.at(-2), sessionType: parts.at(-1), isAdditional: true, updatedAt: '2026-10-18T12:00:00Z' } as CheckIn
        state.entries = [...state.entries.filter(c => c.id !== saved.id), saved]
        state.writes++
        data = saved
      } else data = state.entries
    } else if (path.endsWith('/running') && new URL(request.url()).searchParams.get('allTime') === 'true') {
      // The All time tile's own read (kept runs only): this test is about the synced totals, so it has none.
      data = []
    } else if (path.endsWith('/running')) {
      expect(new URL(request.url()).searchParams.get('includeSynced')).toBe('true')
      const own = state.entries.find(c => c.distanceKm != null && !c.distanceUnreported)
      data = own ? [{ date: own.date, distanceKm: own.distanceKm, source: 'Ticked', distanceUnreported: false }]
        : state.available ? [{ date: '2026-10-14', distanceKm: state.distance, source: 'Strava', distanceUnreported: false, cachedUntil: new Date(Date.now() + 7 * 86400000).toISOString() }]
          : state.entries.map(c => ({ date: c.date, distanceKm: 0, source: 'Ticked', distanceUnreported: true }))
    }
    await route.fulfill({ json: data })
  })
  return state
}

const tile = (page: Page, label: string) => page.locator('.home-tile').filter({ has: page.getByText(label, { exact: true }) })
const value = (page: Page, label: string) => tile(page, label).locator('.home-tile-value .mono')

test('a synced 10 km run counts automatically before and after logging, reload and sync updates @phone', async ({ page }, info) => {
  const state = await history(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  await expect(value(page, 'This month')).toHaveText('10')
  await expect(value(page, 'This year')).toHaveText('10')
  await expect(value(page, 'Weekly average')).toHaveText('0')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  await expect(tile(page, 'This month').getByText('10 km from Strava', { exact: true })).toBeVisible()
  expect(state.writes).toBe(0)
  const running = page.getByRole('region', { name: 'Your running', exact: true })
  await openSyncedRuns(page)
  await running.getByRole('button', { name: 'Log this run', exact: true }).click()
  await expect(running.getByLabel('Run details', { exact: true })).toHaveValue('synthetic-strava')
  await running.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await openRecentRun(page, '2026-10-14')
  await expect(running.getByRole('article', { name: 'Additional run on Wednesday 14 October 2026', exact: true })).toBeVisible()
  await expect(value(page, 'This month')).toHaveText('10')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  expect(state.entries).toHaveLength(1)
  expect(state.entries[0]?.distanceKm).toBeNull()
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 375, height: 1000 })
  await running.screenshot({ path: info.outputPath('automatic-10km-totals.png') })
  await page.reload()
  await expect(value(page, 'This month')).toHaveText('10')
  await expect(value(page, 'This year')).toHaveText('10')
  state.distance = 11
  await page.getByRole('button', { name: 'Update synced distance', exact: true }).click()
  await expect(value(page, 'This month')).toHaveText('11')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  state.available = false
  await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
  await expect(value(page, 'This month')).toHaveText('—')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  await expect(tile(page, 'This month').getByText('Comparison unavailable while distances are missing.', { exact: true })).toBeVisible()
  expect(state.writes).toBe(1)
})

test('an independently entered correction counts once after cache expiry and later reopening @phone', async ({ page }) => {
  const state = await history(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  const running = page.getByRole('region', { name: 'Your running', exact: true })
  await openSyncedRuns(page)
  await running.getByRole('button', { name: 'Log this run', exact: true }).click()
  await running.getByLabel('Run details', { exact: true }).selectOption('')
  await running.getByLabel('Distance (km)', { exact: true }).fill('12')
  await running.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await expect(value(page, 'This month')).toHaveText('12')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  expect(state.entries).toHaveLength(1)
  expect(state.entries[0]?.activityId).toBe('synthetic-strava')
  state.available = false
  await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
  await expect(value(page, 'This month')).toHaveText('12')
  state.available = true
  await page.reload()
  await expect(value(page, 'This month')).toHaveText('12')
  await expect(value(page, 'This year')).toHaveText('12')
  await expect(tile(page, 'This month').getByText('1 run', { exact: true })).toBeVisible()
  expect(state.writes).toBe(1)
})
