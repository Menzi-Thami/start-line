import { accessibility } from './accessibility'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chapter, journeyOf, raceResult, recovery } from '../src/features/journey/journey-fixtures'
import { openHomeLibrary } from './navigation'
const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
const recording = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-tempo.json', import.meta.url), 'utf8'))
const baseline = process.env.SIMPLICITY_BASELINE === '1'
const root = fileURLToPath(new URL(`../../docs/qa/2026-11-17/simplicity/${baseline ? 'before' : 'after'}/`, import.meta.url))
const fixture = `http://127.0.0.1:${process.env.SIMPLICITY_FIXTURE_PORT ?? '5176'}/e2e/fixtures/journey.html?view=home`
const scenes = ['training', 'synced', 'race-review', 'race-saved', 'recovery', 'paused', 'recovery-ended', 'safety', 'settled', 'failed'] as const
async function mock(page: Page, scene: typeof scenes[number]) {
  const training = scene === 'training' || scene === 'synced'
  const today = training ? '2026-10-20' : scene === 'race-review' || scene === 'race-saved' ? '2026-11-16' : scene === 'recovery' ? '2026-11-18' : '2026-12-02'
  const session = plan.weeks.flatMap((week: { sessions: { date: string; type: string }[] }) => week.sessions).find((value: { date: string }) => value.date === today)
  const run = { ...recording, id: 'simplicity-run', localDate: today, startedAt: `${today}T06:00:00Z`, distanceKm: 8.4, movingSeconds: 3000, elapsedSeconds: 3040, paceSecondsPerKm: 3000 / 8.4, plannedSessionType: session?.type ?? null, source: { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/9007199254740993', cachedUntil: '2027-01-01T00:00:00Z', recordedOnGarmin: false } }
  const summary = { id: 'simplicity-plan', name: plan.race.name, raceName: plan.race.name, raceDate: plan.race.date, status: 'Active', createdAt: '2026-10-08T08:00:00Z' }
  const inputs = { raceName: plan.race.name, distanceKm: 5, raceDate: plan.race.date, goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', strengthDays: ['Monday'], planFrom: '2026-10-08', version: 1, experience: 'Regular' }
  const ended = chapter({ status: 'Concluded', lifecycle: 'Concluded', raceResult: scene === 'race-review' ? null : raceResult({ timeKind: 'RecordedElapsed', finishTime: '02:06:15', distanceKm: 20.3 }), achievements: [] })
  const rec = scene === 'recovery' ? recovery() : scene === 'paused' ? recovery({ status: 'Paused', dayNumber: 2 }) : scene === 'recovery-ended' ? recovery() : scene === 'safety' ? recovery({ seekCare: true, phase: 'SeekCare', safetyMessage: 'Please get medical advice before exercising.', readiness: 'PainOrInjury' }) : null
  const journey = journeyOf(training ? [] : [ended], { recovery: rec })
  const writes: string[] = []
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname
    if (request.method() !== 'GET' && !path.endsWith('/coach')) writes.push(path)
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: 'simplicity@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21' }
    else if (path === '/api/v1/me/plans') data = training ? [summary] : []
    else if (path === '/api/v1/plans') data = plan
    else if (path === `/api/v1/me/plans/${summary.id}` || path.endsWith('/coach')) data = { ...summary, inputs, plan, coaching: [] }
    else if (path.endsWith('/strava-completions')) data = scene === 'synced' ? [{ date: today, sessionType: session.type, activityId: run.id, state: 'Completed', measure: 'Distance', actualKm: 8.4, actualSeconds: 3000, plannedKm: 6, plannedSeconds: 0, feedback: 'Longer', cachedUntil: run.source.cachedUntil }] : []
    else if (path === '/api/v1/me/activities') data = [run]
    else if (path === `/api/v1/me/activities/${run.id}`) data = run
    else if (path === '/api/v1/me/journey') {
      if (scene === 'failed') { await route.fulfill({ status: 503, json: { detail: 'Your saved chapter could not load.' } }); return }
      data = journey
    } else if (path === `/api/v1/me/journey/plans/${ended.planId}`) data = ended
    else if (path.endsWith('/journey/races')) data = { races: [], majors: [] }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/strava')) data = { available: true, connected: true, status: 'Active', includesPrivateRuns: true, syncedRuns: 1, pending: 0, failed: 0 }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date(`${today}T08:00:00Z`) })
  return { writes, run }
}

for (const mode of ['light', 'dark'] as const) test(`Run detail hierarchy: ${mode} @phone`, async ({ page }, info) => {
  await mock(page, 'synced')
  await page.addInitScript(value => localStorage.setItem('taperday:theme', value), mode)
  await page.goto(fixture.replace('?view=home', '?view=runs&run=simplicity-run'))
  if (baseline) await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
  await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute('aria-pressed', String(mode === 'dark'))
  await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('8.4 km')
  await page.evaluate(() => document.fonts.ready)
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))) })
    if (!baseline) {
      const audit = await accessibility(page).analyze()
      expect(audit.violations.map(value => ({ id: value.id, targets: value.nodes.map(node => node.target) }))).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await expect(page.getByRole('heading', { name: 'Plan vs actual' })).toHaveCount(0)
    }
    if (info.project.name === 'desktop') {
      mkdirSync(root, { recursive: true })
      await page.screenshot({ path: `${root}run-detail-${width}-${mode}.png`, fullPage: true, animations: 'disabled' })
    }
  }
})

test('recording identity and the Home or filtered Runs origin survive reload @phone', async ({ page }) => {
  const { run } = await mock(page, 'synced')
  await page.route('**/api/v1/me/activities', route => route.fulfill({ json: [run, { ...run, id: 'uploaded-run', source: { kind: 'Upload' } }] }))
  await page.goto(fixture)
  await page.getByRole('button', { name: 'Open run details', exact: true }).click()
  await expect(page).toHaveURL(/run=simplicity-run/)
  await page.reload()
  await page.getByRole('button', { name: /Back to previous page/ }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi' })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('button', { name: 'Runs', exact: true }).click()
  await page.getByRole('group', { name: 'Show runs from', exact: true }).getByRole('button', { name: 'This week', exact: true }).click()
  await page.getByRole('group', { name: 'Show runs by source', exact: true }).getByRole('button', { name: 'Strava', exact: true }).click()
  await expect(page.locator('.run-feed-open')).toHaveCount(1)
  await page.locator('.run-feed-open').click()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('8.4 km')
  await page.getByRole('button', { name: /Back to previous page/ }).click()
  await expect(page).toHaveURL(/range=week/)
  await expect(page).toHaveURL(/source=Strava/)
  await expect(page.getByRole('button', { name: 'This week', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: 'Show runs by source', exact: true }).getByRole('button', { name: 'Strava', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('Runs opens real insights and tools with keyboard controls and preserved calculator drafts @phone', async ({ page }) => {
  await mock(page, 'training')
  await page.goto(fixture)
  await openHomeLibrary(page, 'tools')
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(nav.getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('region', { name: 'Calculators', exact: true })).toBeVisible()
  await page.getByLabel('Distance', { exact: true }).selectOption('other')
  const input = page.getByLabel('Distance (km)', { exact: true })
  await input.fill('13')
  const tools = page.locator('.home-tools > summary')
  await tools.focus()
  await page.keyboard.press('Enter')
  await expect(input).toBeHidden()
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('13')
  await page.getByRole('button', { name: '← Back to Runs', exact: true }).click()
  await openHomeLibrary(page)
  await expect(page.getByRole('region', { name: 'Personal bests', exact: true })).toBeVisible()
})

test('a missing recording ID is unavailable without substituting a recent recording @phone', async ({ page }) => {
  await mock(page, 'synced')
  await page.route('**/api/v1/me/activities/missing-run', route => route.fulfill({ status: 404, json: { title: 'This recording is no longer available.' } }))
  await page.goto(fixture.replace('?view=home', '?view=runs&run=missing-run&returnTo=%3Fview%3Dhome'))
  await expect(page.getByRole('alert')).toContainText('We couldn’t load that run.')
  await expect(page.getByRole('region', { name: 'Run summary' })).toHaveCount(0)
  await page.getByRole('button', { name: /Back to previous page/ }).click()
  await expect(page.getByRole('button', { name: 'Open run details', exact: true })).toBeVisible()
})

for (const entry of ['Home link', 'fresh device'] as const) test(`failed current-plan lookup stays unknown and retries from ${entry} @phone`, async ({ page }) => {
  await mock(page, 'training')
  let failed = true
  await page.route('**/api/v1/me/plans', async route => {
    if (failed) await route.fulfill({ status: 503, json: { title: 'Temporarily unavailable' } })
    else await route.fallback()
  })
  await page.goto(entry === 'Home link' ? fixture : fixture.replace('?view=home', ''))
  await expect(page.getByRole('button', { name: 'Retry current plan', exact: true })).toBeVisible()
  await expect(page.getByText('Finding your current chapter…', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Choose my next challenge', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Runs', exact: true })).toBeVisible()
  failed = false
  await page.getByRole('button', { name: 'Retry current plan', exact: true }).click()
  await expect(page.getByRole('button', { name: "Open today's workout", exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry current plan', exact: true })).toHaveCount(0)
})

for (const mode of ['light', 'dark'] as const) {
  test(`Home remains usable with reduced motion, wide screens and 200% text: ${mode} @phone`, async ({ page }) => {
    await mock(page, 'training')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(fixture)
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    const primary = page.getByRole('button', { name: "Open today's workout", exact: true })
    await expect(primary).toBeVisible()
    for (const width of [320, 390, 820, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    }
    await page.setViewportSize({ width: 375, height: 900 })
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await primary.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'Tuesday 20 October 2026', exact: true })).toBeVisible()
  })
}
for (const scene of scenes) for (const mode of ['light', 'dark'] as const) {
  test(`simple Home: ${scene}, ${mode} @phone`, async ({ page }, info) => {
    const state = await mock(page, scene)
    await page.addInitScript(value => localStorage.setItem('taperday:theme', value), mode)
    await page.goto(fixture)
    if (baseline) await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(page.getByRole('heading', { name: 'Welcome back, Naledi' })).toBeVisible()
    await expect(page.getByText('Finding your current chapter…', { exact: true })).toHaveCount(0)
    await page.evaluate(() => document.fonts.ready)
    if (!baseline) {
      const primary = page.locator('.home-focus .button-primary')
      await expect(primary).toHaveCount(scene === 'failed' ? 0 : 1)
      await expect(page.getByText(/Add training feedback|Coaching, insights and tools/)).toHaveCount(0)
      if (scene === 'training') await expect(primary).toHaveText("Open today's workout")
      if (scene === 'synced') { await expect(primary).toHaveText('Open run details'); await expect(page.locator('.home-today')).toContainText('8.4 km'); await expect(page.getByRole('textbox')).toHaveCount(0) }
      if (scene === 'race-review') await expect(primary).toHaveText('Review my race')
      if (scene === 'race-saved') { await expect(primary).toHaveText('Start recovery plan'); await expect(page.locator('.journey-home')).toContainText('Recording elapsed time') }
      if (['recovery', 'paused', 'safety'].includes(scene)) await expect(primary).toHaveText('Open recovery plan')
      if (['recovery-ended', 'settled'].includes(scene)) { await expect(primary).toHaveText('Choose my next challenge'); await expect(page.getByText('Recovered', { exact: true })).toHaveCount(0) }
      if (scene === 'safety') await expect(page.getByRole('alert')).toContainText('medical advice')
      await expect(page.getByRole('region', { name: 'Recent activity', exact: true })).toBeVisible()
      // Background Strava catch-up is expected; Home must never submit a result, check-in or recovery change.
      expect(state.writes.filter(path => !path.endsWith('/sync/strava/catch-up'))).toEqual([])
    }
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // Start each full audit at its final width in a fresh document; retain every WCAG rule.
      await page.reload()
      if (baseline) await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode)
      await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute('aria-pressed', String(mode === 'dark'))
      await expect(page.getByRole('heading', { name: 'Welcome back, Naledi' })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined))); if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0) })
      if (!baseline) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
        const audit = await accessibility(page).analyze()
        expect(audit.violations.map(value => ({ id: value.id, targets: value.nodes.map(node => node.target) }))).toEqual([])
      }
      if (info.project.name === 'desktop') {
        mkdirSync(root, { recursive: true })
        await page.screenshot({ path: `${root}${scene}-${width}-${mode}.png`, fullPage: true })
      }
    }
    if (!baseline && scene === 'synced') {
      await page.getByRole('button', { name: 'Open run details', exact: true }).click()
      await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('8.4 km')
      await page.reload()
      await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('8.4 km')
    }
  })
}
