import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { today } from '../src/test/run-history-data'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

function daysBefore(n: number) {
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/** A readiness API that keeps what the runner does. */
async function mockApi(page: Page) {
  let days = [
    { date: daysBefore(1), feeling: 'Fresh', sleep: 'Good', soreness: 'None', note: null, updatedAt: '2026-10-13T06:00:00Z' },
    { date: daysBefore(3), feeling: 'Okay', sleep: null, soreness: 'Some', note: 'Hilly long run', updatedAt: '2026-10-11T06:00:00Z' },
  ]
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/me/readiness')) return route.fulfill({ json: [...days].sort((a, b) => b.date.localeCompare(a.date)) })
    if (path.includes('/me/readiness/') && request.method() === 'PUT') {
      const date = path.split('/').at(-1)!
      const saved = { date, ...(request.postDataJSON() as object), updatedAt: '2026-10-14T06:00:00Z' } as (typeof days)[number]
      days = [...days.filter((d) => d.date !== date), saved]
      return route.fulfill({ json: saved })
    }
    if (path.endsWith('/coach')) return route.fulfill({ json: { id: 'visibility-plan', plan, coaching: [] } })
    return route.fulfill({ json: [] })
  })
}

test('a runner logs how they feel, sees safe guidance and their last two weeks, at every width @phone', async ({ page }, info) => {
  await mockApi(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  const readiness = page.locator('details.readiness')
  await readiness.locator('> summary').click()
  await readiness.getByRole('button', { name: 'Tired', exact: true }).click()
  await expect(readiness.getByRole('status')).toHaveText('Saved for today.')
  await expect(readiness.getByText(/Take it easier today/)).toBeVisible()
  await expect(readiness.getByRole('heading', { name: 'Last two weeks' })).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `readiness at ${width}px`).toBeLessThanOrEqual(1)
  }

  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await readiness.screenshot({ path: `../docs/qa/141/readiness-${scheme}-${size}.png`, animations: 'disabled' })
  }
})
