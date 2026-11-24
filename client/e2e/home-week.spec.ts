import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { mockApi } from './perf-api'

const fixture = `http://127.0.0.1:${process.env.HOME_WEEK_FIXTURE_PORT ?? '5176'}/e2e/fixtures/journey.html`
const baseline = process.env.HOME_WEEK_BASELINE === '1'
const capture = process.env.HOME_WEEK_CAPTURE === '1'
const evidence = fileURLToPath(new URL(`../../docs/qa/2026-11-24/home-week/${baseline ? 'before' : 'after'}/`, import.meta.url))

async function auditScreen(page: Page, info: TestInfo, screen: string) {
  expect(page.frames()).toHaveLength(1)
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  await info.attach(`${screen}-accessibility.json`, { body: JSON.stringify(audit, null, 2), contentType: 'application/json' })
  expect(audit.passes.length).toBeGreaterThan(0)
  expect(audit.violations.map(value => ({ id: value.id, targets: value.nodes.map(node => node.target) }))).toEqual([])
}

for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
  test(`large dated workouts fill Home and Plan at ${width}px ${theme} @phone`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    const api = await mockApi(page, { latencyMs: 5 })
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(mode => localStorage.setItem('taperday:theme', mode), theme)
    await page.goto(`${fixture}?view=home`)
    await expect(page.getByRole('region', { name: 'This week', exact: true })).toBeVisible()
    await api.settle()
    await page.evaluate(() => document.fonts.ready)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    if (!baseline) {
      const rows = page.locator('.home-workout-button')
      await expect(rows).toHaveCount(7)
      const bounds = await rows.evaluateAll(elements => elements.map(element => { const rect = element.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } }))
      for (const [index, row] of bounds.entries()) {
        expect(row.height).toBeGreaterThanOrEqual(120)
        expect(row.width).toBeGreaterThanOrEqual(Math.min(width - 120, 500))
        if (index > 0) expect(row.top).toBeGreaterThanOrEqual(bounds[index - 1]!.bottom - 1)
      }
      await rows.last().scrollIntoViewIfNeeded()
      await expect(rows.last()).toBeInViewport()
      await page.evaluate(() => scrollTo(0, 0))
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    if (capture && info.project.name === 'desktop') { mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: `${evidence}home-${width}-${theme}.png`, fullPage: true, animations: 'disabled' }) }
    else await page.screenshot({ path: info.outputPath(`home-week-${width}-${theme}.png`), fullPage: true, animations: 'disabled' })

    await page.getByRole('region', { name: 'This week', exact: true }).getByRole('button', { name: 'View this week', exact: true }).click()
    await expect(page.getByRole('tab', { name: 'This week', exact: true })).toBeVisible()
    if (!baseline) {
      const rows = page.locator('.week-day-button')
      await expect(rows).toHaveCount(7)
      const heights = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
      expect(heights.every(height => height >= 120)).toBe(true)
      await expect(page.locator('.week-agenda .workout-artwork')).toHaveCount(7)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    if (capture && info.project.name === 'desktop') await page.screenshot({ path: `${evidence}plan-${width}-${theme}.png`, fullPage: true, animations: 'disabled' })
    else await page.screenshot({ path: info.outputPath(`plan-week-${width}-${theme}.png`), fullPage: true, animations: 'disabled' })
    expect(errors).toEqual([])
  })

  test(`Home and Plan WCAG audit at ${width}px ${theme} @phone`, async ({ page, browserName }, info) => {
    // Existing Gecko/axe native crash (e2e/axe.ts, PR #276), reproduced in both adapter modes.
    // Keep this as an explicit skipped audit, not an empty successful result. Every Firefox layout/navigation test runs.
    test.skip(browserName === 'firefox', 'Firefox content process crashes inside axe; full audits run in Chromium and WebKit.')
    const api = await mockApi(page, { latencyMs: 5 })
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(mode => localStorage.setItem('taperday:theme', mode), theme)
    await page.goto(`${fixture}?view=home`)
    await expect(page.locator('.home-workout-button')).toHaveCount(7)
    await api.settle()
    await page.evaluate(() => document.fonts.ready)
    await auditScreen(page, info, 'home')
    await page.getByRole('region', { name: 'This week', exact: true }).getByRole('button', { name: 'View this week', exact: true }).click()
    await expect(page.locator('.week-day-button')).toHaveCount(7)
    await auditScreen(page, info, 'plan')
  })
}

test('large workout rows reflow at 320px with doubled text and keep date navigation accessible @phone', async ({ page }) => {
  await mockApi(page, { latencyMs: 5 })
  await page.setViewportSize({ width: 320, height: 780 })
  await page.goto(`${fixture}?view=home`)
  await expect(page.locator('.home-workout-button')).toHaveCount(7)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('region', { name: 'This week', exact: true }).getByRole('button', { name: 'View this week', exact: true }).click()
  const days = page.locator('.week-day-button')
  await expect(days).toHaveCount(7)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await days.first().focus()
  await page.keyboard.press('End')
  await expect(days.last()).toBeFocused()
  await page.keyboard.press('Enter')
  const preview = page.locator('.week-inline-preview')
  await expect(preview).toBeVisible()
  await expect(days.last()).toHaveAttribute('aria-controls', await preview.locator('[id]').first().getAttribute('id') ?? '')
})

test('a weekly recording opens its exact analysis and survives reload and Home return @phone', async ({ page }) => {
  await mockApi(page, { latencyMs: 5 })
  const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
  const session = plan.weeks.flatMap((week: { sessions: { date: string; type: string }[] }) => week.sessions).find((value: { date: string; type: string }) => value.date === '2026-10-13' && value.type !== 'Strength')
  const detail = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-tempo.json', import.meta.url), 'utf8'))
  const recording = { ...detail, id: 'home-week-recording', kind: 'Run', localDate: session.date, startedAt: `${session.date}T06:00:00Z`, plannedSessionType: session.type, source: { kind: 'Upload', format: 'Fit', cachedUntil: null } }
  await page.route('**/api/v1/me/activities', route => route.fulfill({ json: [recording] }))
  await page.route('**/api/v1/me/activities/home-week-recording', route => route.fulfill({ json: recording }))
  await page.goto(`${fixture}?view=home`)
  const week = page.getByRole('region', { name: 'This week', exact: true })
  await expect(week.locator(`[data-date="${session.date}"]`)).toContainText('Recorded run')
  await week.locator(`[data-date="${session.date}"]`).click()
  await expect(page).toHaveURL(/run=home-week-recording/)
  await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL(/run=home-week-recording/)
  await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.locator('.home-workout-button')).toHaveCount(7)
})
