import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

test.use({ serviceWorkers: 'block' })
const qa = fileURLToPath(new URL('../../docs/qa/2026-11-17/phone-runs/', import.meta.url))

async function mockApi(page: Page, hasPlan = false) {
  const plan = JSON.parse(await readFile(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
  const inputs = { raceSlug: null, raceName: plan.race.name, raceDate: plan.race.date, distanceKm: plan.race.distanceKm,
    goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday',
    experience: 'Regular', strengthDays: [], planFrom: plan.startDate, version: 3 }
  await page.clock.install({ time: new Date('2026-10-18T12:00:00Z') })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'phone-runner', displayName: 'Phone QA', timeZone: 'UTC', units: 'Kilometres',
      privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, weeklyEmails: false, heartRateConsent: false }
    else if (path.endsWith('/sync/strava')) data = { available: true, connected: false }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    else if (path === '/api/v1/me/journey') data = { chapters: [], recovery: null, maintenance: null, hasMoreChapters: false, page: 0 }
    else if (path === '/api/v1/me/plans') data = hasPlan ? [{ id: 'phone-plan', name: 'My 5K', status: 'Active', raceDate: plan.race.date }] : []
    else if (path === '/api/v1/me/plans/phone-plan') data = { id: 'phone-plan', name: 'My 5K', status: 'Active', plan, inputs }
    else if (path.endsWith('/coach')) data = { id: 'phone-plan', plan, coaching: [] }
    else if (path === '/api/v1/plans') data = plan
    else if (path === '/api/v1/me/run-data') data = { sources: {}, totals: [], missing: {}, syncIssues: [] }
    await route.fulfill({ json: data })
  })
}

for (const mode of ['light', 'dark']) {
  test(`Nike runner finds phone help, understands history limits and opens connections in ${mode} mode @phone`, async ({ page }, info) => {
    const errors: string[] = []
    const deviceViewport = page.viewportSize()!
    page.on('pageerror', error => errors.push(error.message))
    await mockApi(page)
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await page.getByText('Add runs from a file', { exact: true }).click()
    await page.getByRole('button', { name: 'See phone & Nike Run Club help', exact: true }).click()
    const guide = page.locator('details.phone-runs')
    await expect(guide).toHaveAttribute('open', '')
    await expect(guide.locator('summary')).toBeFocused()
    const focused = await guide.locator('summary').boundingBox()
    const header = await page.locator('.masthead').boundingBox()
    expect(focused!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    await expect(guide.getByText('Settings → Partners → Strava', { exact: true })).toBeVisible()
    await expect(guide.getByText(/Only runs recorded after linking Nike to Strava will sync/)).toBeVisible()
    await expect(guide.getByRole('button', { name: 'Open my training plan', exact: true })).toHaveCount(0)
    await page.getByText('Add runs from a file', { exact: true }).click()
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // Help stays open when the mobile panel moves into the desktop split view.
      await expect(page.locator('.runs-split')).toHaveCount(width >= 1024 ? 1 : 0)
      await expect(guide).toHaveAttribute('open', '')
      await expect(guide.getByText('Settings → Partners → Strava', { exact: true })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px`).toBeLessThanOrEqual(1)
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
      if (width === 375 || width === 1440) {
        // Full-page captures should start above the sticky header; axe may move keyboard focus.
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
          window.scrollTo(0, 0)
        })
        await page.screenshot({ path: info.outputPath(`phone-run-options-${width}-${mode}.png`), fullPage: width >= 1024 })
        if (info.project.name === 'desktop') {
          await mkdir(qa, { recursive: true })
          await page.screenshot({ path: `${qa}/phone-${width}-${mode}.png`, fullPage: width >= 1024 })
        }
      }
    }
    // Continue the journey at the project's actual device size after the viewport audits.
    await page.setViewportSize(deviceViewport)
    await expect(page.locator('.runs-split')).toHaveCount(deviceViewport.width >= 1024 ? 1 : 0)
    await expect(guide).toHaveAttribute('open', '')
    await guide.getByRole('button', { name: 'Open connection settings', exact: true }).click()
    await expect(page).toHaveURL(/view=account&settings=connections/)
    const connections = page.getByText('Connections & run sources', { exact: true }).locator('..')
    await expect(connections).toHaveAttribute('open', '')
    await expect(connections.getByRole('button', { name: 'Connect with Strava', exact: true })).toBeVisible()
    await connections.getByText('How do my runs get into Strava?', { exact: true }).click()
    await expect(connections.getByText('Nike Run Club', { exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('phone runner can reach the existing manual training log without a recording @phone', async ({ page }) => {
  await mockApi(page, true)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
  await page.getByText('I run with my phone', { exact: true }).click()
  await page.getByRole('button', { name: 'Open my training plan', exact: true }).click()
  await page.getByRole('button', { name: 'Log a run', exact: true }).click()
  await expect(page.getByLabel('Run date', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Distance (km)', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Run details', { exact: true })).toBeVisible()
})
