import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

const weekStart = (i: number) => new Date(Date.UTC(2026, 8, 21 + i * 7)).toISOString().slice(0, 10)
const insights = {
  today: '2026-11-15',
  trends: {
    weeks: Array.from({ length: 8 }, (_, i) => ({ weekStart: weekStart(i), plannedKm: 22 + i, ranKm: i === 7 ? 34 : 20 + i, stravaKm: i === 7 ? 8 : 0, runs: 4, unknownDistances: 0, isCurrent: i === 7 })),
    load: { recentKm: 38, baselineWeeklyKm: 24, baselineWeeksRun: 4, changePercent: 58, signal: 'RisingFast' },
    adherence: { planned: 16, done: 13, skipped: 1, unlogged: 2, share: 0.81 },
    easyPace: { recentRuns: 5, earlierRuns: 4, recentSecondsPerKm: 338, earlierSecondsPerKm: 351, changeSecondsPerKm: -13, recentHeartRate: 143, earlierHeartRate: 149 },
    gaps: ['StravaWindow', 'UnloggedSessions'],
    nextStep: 'HoldVolume',
    reasons: ['LoadSpike'],
  },
  decisions: [
    { weekStart: '2026-11-09', outcome: 'Accepted', verdict: 'OnTrack', reasons: ['BuildingConsistency'], changedPlan: false, recovery: 'Ready', decidedAt: '2026-11-08T18:00:00Z' },
    { weekStart: '2026-11-02', outcome: 'Declined', verdict: 'Struggling', reasons: ['RecoveryFatigue'], changedPlan: true, recovery: 'Tired', decidedAt: '2026-11-01T18:30:00Z' },
  ],
}

async function mockApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/insights')) return route.fulfill({ json: insights })
    if (path.endsWith('/coach')) return route.fulfill({ json: { id: 'visibility-plan', plan, coaching: [] } })
    return route.fulfill({ json: [] })
  })
}

test('training trends explain the next step and fit every width, light and dark @phone', async ({ page }, info) => {
  await mockApi(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  await page.locator('details.home-insights > summary').click()

  const trends = page.locator('section.home-trends')
  await expect(trends.getByRole('heading', { name: 'Hold your distance this week' })).toBeVisible()
  await expect(trends.locator('.insights-why').getByText(/58% above your average week before that/)).toBeVisible()
  await expect(trends.getByRole('region', { name: 'Coaching history' }).getByText('Declined')).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `trends at ${width}px`).toBeLessThanOrEqual(1)
  }

  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await trends.screenshot({ path: `../docs/qa/140/trends-${scheme}-${size}.png`, animations: 'disabled' })
  }
})
