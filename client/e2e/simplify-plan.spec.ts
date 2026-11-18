import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Before/after evidence for the simpler Plan tab: the real App with synthetic API responses, no real runner data.
// PLAN_BASELINE=1 writes the "before" set from the unchanged staging presentation.
const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
const recording = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-tempo.json', import.meta.url), 'utf8'))
const baseline = process.env.PLAN_BASELINE === '1'
const root = fileURLToPath(new URL(`../../docs/qa/2026-11-18/simplify-plan/${baseline ? 'before' : 'after'}/`, import.meta.url))
const fixture = `http://127.0.0.1:${process.env.SIMPLICITY_FIXTURE_PORT ?? '5176'}/e2e/fixtures/journey.html?view=home`
const today = '2026-10-20'

async function mock(page: Page) {
  const run = { ...recording, id: 'plan-tab-run', localDate: '2026-10-18', startedAt: '2026-10-18T06:00:00Z', distanceKm: 8.4, movingSeconds: 3000, elapsedSeconds: 3040, paceSecondsPerKm: 3000 / 8.4, plannedSessionType: null, source: { kind: 'Upload' } }
  const summary = { id: 'plan-tab-plan', name: plan.race.name, raceName: plan.race.name, raceDate: plan.race.date, status: 'Active', createdAt: '2026-10-08T08:00:00Z' }
  const inputs = { raceName: plan.race.name, distanceKm: 5, raceDate: plan.race.date, goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', strengthDays: ['Monday'], planFrom: '2026-10-08', version: 1, experience: 'Regular' }
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: 'plan@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21' }
    else if (path === '/api/v1/me/plans') data = [summary]
    else if (path === '/api/v1/plans') data = plan
    else if (path === `/api/v1/me/plans/${summary.id}` || path.endsWith('/coach')) data = { ...summary, inputs, plan, coaching: [] }
    else if (path === '/api/v1/me/activities') data = [run]
    else if (path === `/api/v1/me/activities/${run.id}`) data = run
    else if (path === '/api/v1/me/journey') data = { chapters: [], recovery: null, maintenance: null, hasMoreChapters: false, page: 0 }
    else if (path.endsWith('/journey/races')) data = { races: [], majors: [] }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/calendar')) data = { token: 'synthetic-calendar' }
    else if (path.endsWith('/strava')) data = { available: true, connected: false }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date(`${today}T08:00:00Z`) })
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => undefined)))
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    scrollTo(0, 0)
  })
}

for (const mode of ['light', 'dark'] as const) test(`Plan tab screens: ${mode}`, async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Screenshots come from one browser project')
  await mock(page)
  await page.addInitScript(value => localStorage.setItem('taperday:theme', value), mode)
  await page.goto(fixture)
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: plan.race.name, level: 2 })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
  mkdirSync(root, { recursive: true })
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('tab', { name: 'This week', exact: true }).click()
    await settle(page)
    await page.screenshot({ path: `${root}week-${width}-${mode}.png`, fullPage: true, animations: 'disabled' })

    const tools = page.locator('.plan-tools')
    const toolbox = page.locator('summary').filter({ hasText: /^Plan tools/ })
    if (await toolbox.count()) {
      if (!await toolbox.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await toolbox.click()
      const options = page.locator('summary').filter({ hasText: /^Plan options$/ })
      if (await options.count() && !await options.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await options.click()
    }
    await settle(page)
    await tools.scrollIntoViewIfNeeded()
    await tools.screenshot({ path: `${root}tools-${width}-${mode}.png`, animations: 'disabled' })
    if (await toolbox.count()) await toolbox.click()

    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    await settle(page)
    await page.screenshot({ path: `${root}calendar-${width}-${mode}.png`, fullPage: true, animations: 'disabled' })

    await page.getByRole('tab', { name: 'Progress', exact: true }).click()
    const more = page.locator('summary').filter({ hasText: /^More detail/ })
    await more.waitFor()
    if (!await more.evaluate(element => (element.parentElement as HTMLDetailsElement).open)) await more.click()
    await settle(page)
    await page.screenshot({ path: `${root}progress-${width}-${mode}.png`, fullPage: true, animations: 'disabled' })
  }
})
