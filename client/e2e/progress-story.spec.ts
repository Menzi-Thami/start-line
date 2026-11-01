import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

function story(weeks: number) {
  return {
    today: '2026-11-15',
    story: {
      weeks,
      weekRows: Array.from({ length: weeks }, (_, i) => ({ weekStart: new Date(Date.UTC(2026, 10, 16 - 7 * (weeks - i))).toISOString().slice(0, 10), ranKm: 18 + i * 1.5, plannedKm: 22 + i, runs: 4, longestKm: 7 + i * 0.6, isCurrent: i === weeks - 1 })),
      current: { from: '2026-10-19', to: '2026-11-15', km: 96.5, runs: 17, averageWeeklyKm: 24.1, longestKm: 12, weeksRun: weeks },
      previous: { from: '2026-09-21', to: '2026-10-18', km: 81, runs: 15, averageWeeklyKm: 20.3, longestKm: 10, weeksRun: weeks - 1 },
      adherence: { planned: 18, done: 15, skipped: 1, unlogged: 2, share: 0.83 },
      easyPace: { recentRuns: 5, earlierRuns: 4, recentSecondsPerKm: 338, earlierSecondsPerKm: 351, changeSecondsPerKm: -13, recentHeartRate: null, earlierHeartRate: null },
      bests: [
        { name: '5K', distanceMetres: 5000, time: '00:24:12', date: '2026-11-08', before: '00:25:03', isNew: true },
        { name: '10K', distanceMetres: 10000, time: '00:52:40', date: '2026-10-25', before: null, isNew: true },
      ],
      raceGoal: { raceKm: 10, goal: '00:52:00', raceDate: '2026-12-20', estimates: [{ weekStart: '2026-11-09', time: '00:52:31' }], latest: '00:52:31', first: '00:54:05' },
      gaps: ['StravaWindow'],
    },
  }
}

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/progress')) return route.fulfill({ json: story(Number(url.searchParams.get('weeks') ?? 4)) })
    if (url.pathname.endsWith('/coach')) return route.fulfill({ json: { id: 'visibility-plan', plan, coaching: [] } })
    return route.fulfill({ json: [] })
  })
}

test('the progress story compares spans, switches between 4, 8 and 12 weeks and fits every width @phone', async ({ page }, info) => {
  await mockApi(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  await page.locator('details.home-insights > summary').click()

  const progress = page.locator('section.home-progress')
  await expect(progress.getByRole('table', { name: 'The last 4 weeks against the 4 weeks before' })).toBeVisible()
  await expect(progress.getByText(/new best, from 25:03/)).toBeVisible()
  await progress.getByRole('button', { name: '12 weeks' }).click()
  await expect(progress.getByRole('table', { name: 'The last 12 weeks against the 12 weeks before' })).toBeVisible()
  await progress.getByRole('button', { name: '4 weeks' }).click()
  await expect(progress.getByRole('table', { name: 'The last 4 weeks against the 4 weeks before' })).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `progress at ${width}px`).toBeLessThanOrEqual(1)
  }

  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await progress.screenshot({ path: `../docs/qa/143/progress-${scheme}-${size}.png`, animations: 'disabled' })
  }
})
