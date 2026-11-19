import { openRunDay, openRunningTotals } from './navigation'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { CheckIn, CheckInRequest } from '../src/lib/types'
import { formatDate } from '../src/lib/format'
const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

for (const [kind, date] of [['rest', '2026-10-14'], ['strength', '2026-10-12'], ['planned-run', '2026-10-13']]) {
  test(`logging a run on a ${kind} day survives navigation, reload and cache expiry @phone`, async ({ page }, info) => {
    let entries: CheckIn[] = []
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.route('**/api/v1/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      let data: unknown = []
      if (path.endsWith('/coach')) data = { id: 'visibility-plan', plan, coaching: [] }
      else if (path.includes('/check-ins')) {
        if (request.method() === 'PUT') {
          const parts = path.split('/')
          const body = request.postDataJSON() as CheckInRequest
          const entry = { ...body, id: parts.at(-3), date: parts.at(-2), sessionType: parts.at(-1), isAdditional: true, updatedAt: '2026-10-18T12:00:00Z' } as CheckIn
          entries = [...entries.filter(c => c.id !== entry.id), entry]
          data = entry
        } else data = entries
      } else if (path.endsWith('/running')) data = entries.map(c => ({ date: c.date, distanceKm: c.distanceKm ?? 0, distanceUnreported: c.distanceUnreported, source: 'Ticked' }))
      await route.fulfill({ json: data })
    })
    await page.goto(`http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=${date}`)
    const logDay = await openRunDay(page, date!)
    await logDay.getByRole('button', { name: 'Log this run', exact: true }).click()
    await expect(page.getByLabel('Run date')).toHaveValue(date!)
    await page.getByLabel('Run details').selectOption('')
    await expect(page.getByLabel('Distance (km)', { exact: true })).toHaveValue('')
    await page.getByLabel('Distance (km)', { exact: true }).fill('10')
    await page.getByLabel('Hours', { exact: true }).fill('1')
    await page.getByRole('button', { name: 'Save check-in', exact: true }).dblclick()
    const name = `Additional run on ${formatDate(date!, 'long')}`
    await expect(logDay.getByRole('article', { name, exact: true })).toContainText('10 km · 1:00:00')
    const running = await openRunningTotals(page)
    await expect(running.locator('.home-tiles .home-tile').filter({ hasText: 'This month' }).locator('.home-tile-value .mono')).toHaveText('10')
    expect(entries).toHaveLength(1)
    expect(entries[0]?.activityId).toBe('synthetic-strava')
    const day = await openRunDay(page, date!)
    const saved = day.getByRole('article', { name, exact: true })
    await expect(saved).toBeVisible()
    await expect(saved).toHaveCount(1)
    await expect(day.getByText(/Unplanned run/)).toHaveCount(0)
    if (kind === 'rest') await expect(day.getByRole('region', { name: 'Planned', exact: true })).toContainText('Rest day')
    else {
      await expect(day.getByRole('region', { name: 'Planned', exact: true })).toContainText(kind === 'strength' ? 'Strength & mobility' : 'Hill repeats')
      for (const checkbox of await day.getByRole('checkbox').all()) expect(await checkbox.isChecked()).toBe(false)
    }
    for (const width of [375, 820, 1440, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 375, height: 812 })
    await saved.scrollIntoViewIfNeeded()
    await day.screenshot({ path: info.outputPath(`${kind}-run-saved.png`) })
    await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
    await expect(saved).toContainText('10 km · 1:00:00')
    await day.getByRole('button', { name: /Back to plan/ }).click()
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    const month = page.getByRole('region', { name: 'Your plan by month', exact: true })
    const marker = month.getByRole('button', { name: new RegExp(`^${Number(date!.slice(8))} October: .*1 additional run logged$`) })
    await marker.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: /Open day details/ }).click()
    const daySummary = page.getByRole('region', { name: formatDate(date!, 'long'), exact: true })
    await expect(daySummary.getByRole('article', { name, exact: true })).toContainText('10 km · 1:00:00')
    await page.keyboard.press('Escape')
    await expect(marker).toBeFocused()
    await page.getByRole('button', { name: 'Return home', exact: true }).click()
    await expect((await openRunDay(page, date!)).getByRole('article', { name, exact: true })).toContainText('10 km · 1:00:00')
    await page.reload()
    await expect((await openRunDay(page, date!)).getByRole('article', { name, exact: true })).toBeVisible()
    await openRunningTotals(page)
    await expect(running.getByText('1 run', { exact: true })).toHaveCount(2)
    expect(entries).toHaveLength(1)
    expect(pageErrors).toEqual([])
  })
}
