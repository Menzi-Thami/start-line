import { openDisclosure } from './navigation'
import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
const run = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-long-run.json', import.meta.url), 'utf8'))
test.use({ baseURL: 'http://127.0.0.1:5176' })

// WCAG scans complement keyboard journeys; they do not replace assistive technology review.
for (const scheme of ['dark', 'light'] as const) for (const width of [320, 768, 1440]) {
  test(`WCAG screen journeys in ${scheme} at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname
      const json = path.endsWith('/coach') ? { id: 'visibility-plan', plan, coaching: [] }
        : path.endsWith('/activities') ? [{ ...run, plannedTitle: run.plan.title }]
          : path.endsWith('/strava') ? { available: true, connected: false, status: null, pending: 0, failed: 0 }
            : path.endsWith('/reminders') ? { available: false, enabled: false, devices: [] } : []
      return route.fulfill({ json })
    })
    const scan = async (name: string) => {
      await page.evaluate(() => document.fonts.ready)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      await test.info().attach(`${name}-axe.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
      expect(result.violations, `${name} at ${width}px in ${scheme}`).toEqual([])
    }
    for (const screen of ['home', 'builder', 'runs', 'account']) {
      await page.goto(`/e2e/fixtures/redesign-screens.html?screen=${screen}`)
      await page.getByRole('heading').first().waitFor()
      if (screen === 'account') await openDisclosure(page, 'Connections & run sources')
      await scan(screen)
      if (screen === 'home') {
        await openDisclosure(page, /^Running insights/)
        await scan('home-history')
      }
    }
    await page.goto('/e2e/fixtures/redesign.html?progress=1&stages=1')
    await page.getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
    await scan('week')
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    await page.getByRole('button', { name: /^13 October:/ }).click()
    await scan('calendar')
    await page.getByRole('tab', { name: 'Progress', exact: true }).click()
    await scan('progress-distance')
    await openDisclosure(page, /^More detail/)
    await scan('progress-pace')
    await page.getByRole('tab', { name: 'This week', exact: true }).click()
    await page.getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
    await page.getByRole('button', { name: /Open day details/ }).click()
    await scan('day')
    await page.getByRole('button', { name: 'View run analysis', exact: true }).click()
    for (const name of ['Overview', 'Pacing', 'Coach', 'Splits']) {
      await page.getByRole('tab', { name, exact: true }).click()
      await scan(`run-${name.toLowerCase()}`)
    }
  })
}

for (const scheme of ['dark', 'light'] as const) for (const width of [320, 1440]) {
  test(`Actual App navigation and expanded strength in ${scheme} at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.clock.install({ time: new Date('2026-10-14T12:00:00Z') })
    await page.route('**/api/v1/**', route => route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/plans') ? plan : [],
    }))
    await page.goto('/e2e/fixtures/full-plan.html?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    await expect(page.getByRole('tab', { name: 'This week', exact: true })).toBeVisible()
    const scan = async (name: string) => {
      await page.evaluate(() => document.fonts.ready)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      await test.info().attach(`${name}-axe.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
      expect(result.violations, name).toEqual([])
    }
    await scan('App navigation')
    const strengthPanel = page.locator('#strength-workouts')
    if (!await strengthPanel.evaluate(node => (node as HTMLDetailsElement).open)) {
      await strengthPanel.locator('summary').click()
    }
    await page.locator('.strength-session > summary').first().click()
    await expect(page.getByRole('checkbox').first()).toBeVisible()
    await scan('Expanded strength')
  })
}
