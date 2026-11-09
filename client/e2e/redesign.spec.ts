import { openDisclosure } from './navigation'
import { screenshotPath } from './screenshots'
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'


// Also run through the repository-wide suite, whose default URL serves the production build.
test.use({ baseURL: 'http://127.0.0.1:5176', colorScheme: 'dark' })

for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`Plan → day → run, keyboard and back at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/e2e/fixtures/redesign.html')
    const selector = page.getByRole('button', { name: /^Tuesday 13 October 2026:/ })
    await selector.click()
    await expect(page.getByRole('region', { name: 'Selected day preview' })).toContainText('Hill repeats')
    expect(new URL(page.url()).searchParams.has('day')).toBe(false)
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(await overflow()).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `week-after-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: /Open day details/ }).click()
    await expect(page).toHaveURL(/day=2026-10-13/)
    const day = page.getByRole('region', { name: 'Tuesday 13 October 2026', exact: true })
    await expect(day).toContainText('Hill repeats')
    await expect(day.getByText('How to run it')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Calendar' })).toBeHidden()
    expect(await overflow()).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `day-after-${width}.png`), fullPage: true })
    await page.goBack()
    await expect(selector).toBeFocused()
    await page.goForward()
    await expect(day).toBeVisible()
    await page.reload()
    await expect(day).toBeVisible()
    await page.getByRole('button', { name: 'View run analysis', exact: true }).click()
    const overview = page.getByRole('tab', { name: 'Overview', exact: true })
    for (const button of await page.getByRole('tablist', { name: 'Run analysis' }).getByRole('tab').all()) {
      expect(await button.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    }
    await overview.focus()
    await page.keyboard.press('ArrowRight')
    const pacing = page.getByRole('tabpanel', { name: 'Pacing' })
    await expect(pacing).toBeVisible()
    await pacing.getByLabel('Inspect recorded split').selectOption('1')
    await expect(pacing.getByRole('status')).toContainText('Split 2')
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `pacing-after-${width}.png`), fullPage: true })
    await page.getByRole('tab', { name: 'Pacing', exact: true }).focus()
    await page.keyboard.press('End')
    await expect(page.getByRole('table')).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `run-after-${width}.png`), fullPage: true })
    expect(errors).toEqual([])
  })
}

for (const variant of ['light', 'zoom', 'landscape'] as const) {
  test(`preview and detail in ${variant}`, async ({ page }) => {
    await page.setViewportSize(variant === 'landscape' ? { width: 900, height: 430 } : { width: 1440, height: 900 })
    if (variant === 'light') await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/e2e/fixtures/redesign.html')
    if (variant === 'zoom') await page.evaluate(() => { document.documentElement.style.zoom = '2' })
    await page.getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
    await page.getByRole('button', { name: /Open day details/ }).click()
    await expect(page.getByRole('region', { name: 'Tuesday 13 October 2026', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `day-${variant}.png`), fullPage: true })
  })
}

test('actual App preserves day URLs across plan fetch and refresh, then drills down from Progress', async ({ page }) => {
  const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
  await page.route('**/api/v1/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/plans') ? plan : [] }))
  await page.goto('/e2e/fixtures/full-plan.html?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08&day=2026-10-13&planTab=all&month=2026-10')
  const day = page.getByRole('region', { name: 'Tuesday 13 October 2026', exact: true })
  await expect(day).toBeVisible()
  await expect(page).toHaveURL(/day=2026-10-13/)
  await page.reload()
  await expect(day).toBeVisible()
  await day.getByRole('button', { name: /Back to plan/ }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Progress', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Training progress' })).toBeVisible()
  await page.getByRole('group', { name: 'Progress period' }).getByRole('button', { name: '12 weeks' }).click()
  await openDisclosure(page, /^More detail/)
  await page.getByRole('group', { name: 'Training dates' }).getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
  await expect(day).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('tab', { name: 'Progress', exact: true })).toHaveAttribute('aria-selected', 'true')
})

for (const width of [320, 768, 1440]) {
  test(`Progress charts and stage evidence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/e2e/fixtures/redesign.html?progress=1&stages=1')
    await page.getByRole('tab', { name: 'Progress', exact: true }).click()
    const progress = page.getByRole('region', { name: 'Training progress' })
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `progress-distance-after-${width}.png`), fullPage: true })
    await openDisclosure(page, /^More detail/)
    await expect(progress.getByRole('slider', { name: /Recorded pace across 3 comparable runs/ })).toBeVisible()
    await progress.getByLabel('Inspect a run').selectOption('2')
    await expect(progress.getByRole('status')).toContainText('5:50/km')
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `progress-after-${width}.png`), fullPage: true })
    await page.getByRole('tab', { name: 'This week', exact: true }).click()
    await page.getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
    await page.getByRole('button', { name: /Open day details/ }).click()
    await page.getByRole('button', { name: 'View run analysis', exact: true }).click()
    const evidence = page.getByRole('region', { name: 'Workout stage evidence' })
    await page.evaluate(() => scrollTo(0, 0))
    await expect(page.locator('.activity-stats-primary')).toBeInViewport({ ratio: 1 })
    await expect(evidence).toContainText('Estimated alignment')
    await expect(evidence).toContainText('Window covered')
    await expect(evidence).toContainText('0% of sampled')
    await expect(evidence).not.toContainText('Completed as prescribed')
    await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `stages-after-${width}.png`), fullPage: true })
  })
}

for (const width of [320, 768, 1440]) {
  test(`Home, builder, Runs and Account at ${width}px`, async ({ page }) => {
      const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
    const run = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-long-run.json', import.meta.url), 'utf8'))
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname
      const json = path.endsWith('/coach') ? { id: 'visibility-plan', plan, coaching: [] }
        : path.endsWith('/activities') ? [{ ...run, plannedTitle: run.plan.title, source: run.source }]
          : path.endsWith('/sync/strava') ? { available: true, connected: false, status: null, athleteId: null, lastSyncedAt: null, pending: 0, failed: 0 }
            : path.endsWith('/calendar') ? { token: 'synthetic-calendar-token' }
              : path.endsWith('/reminders') ? { available: false, enabled: false, devices: [] } : []
      return route.fulfill({ json })
    })
    await page.setViewportSize({ width, height: 900 })
    for (const screen of ['home', 'builder', 'runs', 'account']) {
      await page.goto(`/e2e/fixtures/redesign-screens.html?screen=${screen}`)
      if (screen === 'home') await expect(page.getByRole('button', { name: "Open today's workout" })).toBeVisible()
      if (screen === 'builder') {
        await expect(page.getByRole('button', { name: 'Build my plan' })).toBeVisible()
        const framed = await page.locator('.plan-builder-flow[data-framed]').count()
        const review = await page.locator(framed ? '.wizard-question' : '.review').boundingBox()
        const actions = await page.locator('.wizard-nav').boundingBox()
        expect(actions!.y).toBeGreaterThanOrEqual(review!.y + review!.height)
      }
      if (screen === 'runs') await expect(page.getByRole('button', { name: /Run analysis/ })).toBeVisible()
      if (screen === 'account') {
        await expect(page.getByRole('region', { name: 'Account overview' })).toContainText('Strava not connected')
        await page.getByRole('button', { name: 'Manage run connections' }).click()
        await expect(page.getByText('Connections & run sources', { exact: true })).toBeFocused()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: screenshotPath(test.info(), 'redesign', `${screen}-after-${width}.png`), fullPage: true })
    }
    expect(errors).toEqual([])
  })
}

for (const width of [320, 768, 1440]) {
  test(`Progress period and keyboard date survive navigation at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/e2e/fixtures/redesign.html?progress=1&stages=1')
    await page.getByRole('tab', { name: 'Progress', exact: true }).click()
    const progress = page.getByRole('region', { name: 'Training progress' })
    await expect(progress.getByRole('heading', { name: 'Weekly distance', exact: true })).toBeVisible()
    await expect(progress.getByRole('group', { name: 'Training dates' })).toBeHidden()
    await openDisclosure(page, /^More detail/)
    await progress.getByLabel('Inspect a run').selectOption('2')
    await expect(progress.getByRole('status')).toContainText('5:50/km')
    const dates = progress.getByRole('group', { name: 'Training dates' })
    await dates.locator('[data-date="2026-09-01"]').focus()
    await expect(dates.locator('[tabindex="0"]')).toHaveAttribute('data-date', '2026-09-01')
    await progress.getByRole('group', { name: 'Progress period' }).getByRole('button', { name: '4 weeks', exact: true }).click()
    await expect(dates.locator('[tabindex="0"]')).toHaveAttribute('data-date', '2026-10-14')
    await expect(page).toHaveURL(/progressWeeks=4/)
    await page.reload()
    await expect(progress.getByRole('group', { name: 'Progress period' }).getByRole('button', { name: '4 weeks', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await openDisclosure(page, /^More detail/)
    await dates.locator('[data-date="2026-10-13"]').click()
    await page.getByRole('button', { name: /Back to plan/ }).click()
    // Back from a day, the row it was opened from is still open.
    await expect(dates).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
}
