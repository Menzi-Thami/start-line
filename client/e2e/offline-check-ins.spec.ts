import { accessibility } from './accessibility'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { CheckIn, CheckInRequest } from '../src/lib/types'
import { openRunDay } from './navigation'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
const fixture = 'http://127.0.0.1:5176/e2e/fixtures/run-history.html?empty=1'

// The app files stay reachable in this fixture; only account requests are interrupted. The production service-worker
// offline-shell test is in taperday.spec.ts. Neither fixture substitutes for physical-device or provider validation.
async function connection(page: Page, online: boolean) {
  await page.evaluate(value => {
    localStorage.setItem('qa:offline', value ? '0' : '1')
    window.dispatchEvent(new Event(value ? 'online' : 'offline'))
  }, online)
}

for (const mode of ['light', 'dark'] as const) {
  test(`offline run → edit → navigate → reload → reconnect preserves exactly one entry, ${mode} @phone`, async ({ page }, info) => {
    let entries: CheckIn[] = []
    let writes = 0
    let accountConnected = true
    await page.addInitScript(() => Object.defineProperty(navigator, 'onLine', {
      get: () => localStorage.getItem('qa:offline') !== '1', configurable: true,
    }))
    await page.addInitScript(value => localStorage.setItem('taperday:theme', value), mode)
    await page.route('**/api/v1/**', async route => {
      if (!accountConnected) return route.abort('internetdisconnected')
      const path = new URL(route.request().url()).pathname
      let data: unknown = []
      if (path.endsWith('/coach')) data = { id: 'visibility-plan', plan, coaching: [] }
      else if (path.includes('/check-ins')) {
        if (route.request().method() === 'PUT') {
          writes++
          const parts = path.split('/')
          const body = route.request().postDataJSON() as CheckInRequest
          const entry = { ...body, pain: body.pain ?? 'None', painArea: null, id: parts.at(-3), date: parts.at(-2),
            sessionType: parts.at(-1), isAdditional: true, updatedAt: '2026-10-18T12:00:00Z', version: `version-${writes}` } as CheckIn
          entries = [...entries.filter(item => item.id !== entry.id), entry]
          data = entry
        } else data = entries
      } else if (path.endsWith('/running')) data = entries.map(entry => ({ date: entry.date, distanceKm: entry.distanceKm, source: 'Ticked' }))
      await route.fulfill({ json: data })
    })
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto(fixture)
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
    // Logging lives on the run's own day.
    await page.getByRole('button', { name: /^Wednesday 14 October 2026:/ }).click()
    await page.getByRole('button', { name: /Open day details/ }).click()
    await expect(page.getByRole('button', { name: 'Log a run', exact: true })).toBeVisible()
    accountConnected = false
    await connection(page, false)
    await expect(page.getByText(/Offline · showing your saved run entries/)).toBeVisible()
    await page.getByRole('button', { name: 'Log a run', exact: true }).click()
    await page.getByLabel('Distance (km)', { exact: true }).fill('7')
    await page.getByLabel('Minutes', { exact: true }).fill('42')
    await page.getByRole('button', { name: 'Save check-in', exact: true }).click()
    const status = page.getByRole('region', { name: 'Runs waiting to sync' })
    await expect(status).toContainText('1 run change waiting to sync')
    await page.getByRole('button', { name: 'Return home', exact: true }).click()
    await openRunDay(page, '2026-10-14')
    const entry = page.getByRole('article', { name: 'Additional run on Wednesday 14 October 2026', exact: true })
    await expect(entry).toContainText('7 km · 42:00')
    await entry.getByRole('button', { name: 'Change how Additional run went', exact: true }).click()
    await page.getByLabel('Distance (km)', { exact: true }).fill('8')
    await page.getByRole('button', { name: 'Save check-in', exact: true }).click()
    await expect(status).toContainText('1 run change waiting to sync')
    expect(writes).toBe(0)
    await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
    await expect(status).toContainText('1 run change waiting to sync')
    await page.reload()
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(status).toContainText('Saved on this device')
    await openRunDay(page, '2026-10-14')
    await expect(entry).toContainText('8 km · 42:00')
    await status.getByRole('button', { name: 'Review device drafts' }).click()
    await expect(status).toContainText('Device draft: Done · 8 km · 00:42:00')
    // Audit the actual Home alert after leaving the plan day.
    await page.getByRole('button', { name: 'Return home', exact: true }).click()
    await page.reload()
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
    await status.getByRole('button', { name: 'Review device drafts' }).click()
    await expect(status).toContainText('Device draft: Done · 8 km · 00:42:00')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    const audit = await accessibility(page).analyze()
    expect(audit.violations).toEqual([])
    await status.screenshot({ path: info.outputPath(`offline-run-${mode}.png`) })
    await openRunDay(page, '2026-10-14')
    await expect(entry).toContainText('8 km · 42:00')
    accountConnected = true
    await connection(page, true)
    await expect(status).toHaveCount(0)
    await expect(entry).toContainText('8 km · 42:00')
    expect(writes).toBe(1)
    expect(entries).toHaveLength(1)
    await page.reload()
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await openRunDay(page, '2026-10-14')
    await expect(entry).toContainText('8 km · 42:00')
    expect(writes).toBe(1)
  })
}
