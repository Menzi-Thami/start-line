import { expect, test, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from './axe'
import { mockApi } from './perf-api'

// Actual application/screens with disposable synthetic responses; no live identities or providers.
const fixture = 'http://127.0.0.1:5176/e2e/fixtures/journey.html'
test.use({ serviceWorkers: 'block' })

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), name).toBeLessThanOrEqual(1)
  await expect(page.locator('main')).not.toContainText(/\bundefined\b|\bNaN\b|\[object Object\]/)
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
}

for (const width of [320, 375, 390, 393, 430, 768, 1024, 1440, 1920, 2560]) {
  for (const theme of ['light', 'dark']) {
    test(`primary journey ${width}px ${theme}: Home → all Plan tabs → Runs → Journey → Account`, async ({ page }, info) => {
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      const api = await mockApi(page, { latencyMs: 10 })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${fixture}?view=home`)
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode }, theme)
      const nav = page.getByRole('navigation', { name: 'Main', exact: true })
      await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
      await api.settle()
      await capture(page, info, `home-${width}-${theme}`)
      await nav.getByRole('button', { name: 'Plan', exact: true }).click()
      await expect(page.getByRole('tab', { name: 'This week', exact: true })).toBeVisible()
      await expect(page.locator('.finding-plan')).toHaveCount(0)
      for (const tab of ['This week', 'Calendar', 'Strength', 'Progress']) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true')
        await capture(page, info, `plan-${tab.replaceAll(' ', '-')}-${width}-${theme}`)
      }
      for (const screen of ['Runs', 'Journey', 'Account']) {
        await nav.getByRole('button', { name: screen, exact: true }).click()
        await expect(nav.getByRole('button', { name: screen, exact: true })).toHaveAttribute('aria-current', 'page')
        await api.settle()
        await capture(page, info, `${screen.toLowerCase()}-${width}-${theme}`)
        if (width === 390) {
          const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
          expect(audit.violations).toEqual([])
        }
      }
      await nav.getByRole('button', { name: 'Home', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
      expect(errors).toEqual([])
    })
  }
}

for (const theme of ['light', 'dark']) {
  test(`a new runner chooses a first goal, with no implied previous plan: ${theme} @phone`, async ({ page }, info) => {
    await mockApi(page, { latencyMs: 10 })
    await page.route('**/api/v1/me/plans', route => route.fulfill({ json: [] }))
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${fixture}?view=home`)
    await page.evaluate(mode => { document.documentElement.dataset.theme = mode }, theme)
    await expect(page.getByRole('heading', { name: 'What are you running towards?' })).toBeVisible()
    await capture(page, info, `first-goal-${theme}`)
    // Reviewable visual baseline for the revised first-run card, Chromium desktop only.
    if (info.project.name === 'desktop') await expect(page.locator('.journey-home')).toHaveScreenshot(`first-goal-${theme}.png`)
    await page.getByRole('button', { name: 'Choose my goal', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Which race?' })).toBeVisible()
  })
}

for (const status of [401, 403, 409, 429, 500]) {
  test(`Runs ${status} is an error, not empty history; retry restores recordings @phone`, async ({ page }, info) => {
    await mockApi(page, { latencyMs: 10 })
    let failed = true
    await page.route('**/api/v1/me/activities', async route => {
      if (failed) await route.fulfill({ status, json: { title: 'Synthetic QA request failed' } })
      else await route.fallback()
    })
    await page.goto(`${fixture}?view=runs`)
    const alert = page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) })
    await expect(alert).toBeVisible()
    await expect(page.getByText('No runs yet.', { exact: true })).toHaveCount(0)
    await capture(page, info, `runs-error-${status}`)
    failed = false
    await alert.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('button', { name: /Run analysis/ }).first()).toBeVisible()
    await expect(alert).toHaveCount(0)
  })
}

test('a delayed Strava return shows the actual outcome and refreshes its connection status @phone', async ({ page }, info) => {
  await mockApi(page, { latencyMs: 10 })
  let held: import('@playwright/test').Route | null = null
  let connected = false
  await page.route('**/api/v1/me/sync/strava', async route => {
    if (route.request().method() === 'POST') { held = route; return }
    await route.fulfill({ json: { available: true, connected, status: connected ? 'Active' : null, pending: 0, failed: 0, syncedRuns: 0, includesPrivateRuns: false } })
  })
  await page.addInitScript(() => history.replaceState(null, '', '/strava/callback?state=synthetic-state&code=synthetic-code&scope=read,activity:read_all'))
  await page.goto(fixture)
  await expect.poll(() => held !== null).toBe(true)
  await expect(page.getByRole('status', { name: 'Finishing connecting Strava…', exact: true })).toBeVisible()
  connected = true
  await held!.fulfill({ json: { available: true, connected: true, status: 'Active' } })
  await expect(page.getByText(/Strava is connected. Your runs from the last six weeks are on their way/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Disconnect Strava', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect with Strava', exact: true })).toHaveCount(0)
  await capture(page, info, 'strava-return-confirmed')
})
