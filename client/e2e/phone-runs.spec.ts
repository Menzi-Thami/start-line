import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { ActivitySummary, StravaStatus, SyncIssue } from '../src/lib/types'

test.use({ serviceWorkers: 'block' })
const qa = fileURLToPath(new URL('../../docs/qa/2026-11-17/phone-runs/', import.meta.url))

interface Imports {
  status: StravaStatus
  runs: ActivitySummary[]
  catchUps: number
  failRuns?: boolean
  failStatus?: boolean
  issues?: SyncIssue[]
}
const connected: StravaStatus = { available: true, connected: true, status: 'Active', includesPrivateRuns: false,
  connectedAt: '2026-10-17T12:00:00Z', lastSyncedAt: null, pending: 1, failed: 0, syncedRuns: 0 }
async function mockApi(page: Page, hasPlan = false, imports?: Imports) {
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
    else if (path.endsWith('/sync/strava')) {
      if (imports?.failStatus) { await route.fulfill({ status: 503, json: { title: 'Import check unavailable' } }); return }
      data = imports?.status ?? { ...connected, connected: false, status: null, pending: 0 }
    }
    else if (path.endsWith('/sync/strava/catch-up')) {
      if (imports) imports.catchUps++
      data = imports?.status ?? connected
    }
    else if (path === '/api/v1/me/activities') {
      if (imports?.failRuns) { await route.fulfill({ status: 503, json: { title: 'Recordings unavailable' } }); return }
      data = imports?.runs ?? []
    }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    else if (path === '/api/v1/me/journey') data = { chapters: [], recovery: null, maintenance: null, hasMoreChapters: false, page: 0 }
    else if (path === '/api/v1/me/plans') data = hasPlan ? [{ id: 'phone-plan', name: 'My 5K', status: 'Active', raceDate: plan.race.date }] : []
    else if (path === '/api/v1/me/plans/phone-plan') data = { id: 'phone-plan', name: 'My 5K', status: 'Active', plan, inputs }
    else if (path.endsWith('/coach')) data = { id: 'phone-plan', plan, coaching: [] }
    else if (path === '/api/v1/plans') data = plan
    else if (path === '/api/v1/me/run-data') data = {
      sources: { uploads: 0, fit: 0, gpx: 0, tcx: 0, unknownFormat: 0, strava: imports?.runs.length ?? 0,
        stravaConnected: imports?.status.connected ?? false, stravaStatus: imports?.status.status ?? null,
        lastSyncedAt: imports?.status.lastSyncedAt ?? null, stravaPending: imports?.status.pending ?? 0 }, totals: [],
      missing: { runs: imports?.runs.length ?? 0, withoutHeartRate: imports?.runs.length ?? 0, withoutElevation: imports?.runs.length ?? 0, withoutSplits: 0, heartRateConsent: false },
      syncIssues: imports?.issues ?? [] }

    await route.fulfill({ json: data })
  })
}

for (const mode of ['light', 'dark']) {
  test(`Strava setup leads with free accounts and keeps app-specific help optional in ${mode} mode @phone`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await mockApi(page)
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await page.getByText('Add runs from a file', { exact: true }).click()
    await page.getByRole('button', { name: 'See Strava setup', exact: true }).click()
    const guide = page.locator('details.phone-runs')
    await expect(guide).toHaveAttribute('open', '')
    await expect(guide.locator(':scope > summary')).toBeFocused()
    const focused = await guide.locator(':scope > summary').boundingBox()
    const header = await page.locator('.masthead').boundingBox()
    expect(focused!.y).toBeGreaterThanOrEqual(header!.y + header!.height)
    await expect(guide.getByText('A free Strava account is enough.', { exact: true })).toBeVisible()
    await expect(guide.getByRole('img', { name: 'Powered by Strava' })).toBeVisible()
    const appHelp = guide.locator('details.device-guide')
    await expect(appHelp).not.toHaveAttribute('open', '')
    await appHelp.locator(':scope > summary').click()
    await guide.getByText('Nike Run Club', { exact: true }).click()
    await expect(guide.getByText(/Settings → Partners → Strava/)).toBeVisible()
    await expect(guide.getByText(/Only runs recorded after linking Nike to Strava will sync/)).toBeVisible()
    await expect(guide.getByRole('button', { name: 'Open my training plan', exact: true })).toHaveCount(0)
    // Exercise navigation at the real device size, before changing emulation for visual audits.
    await guide.getByRole('button', { name: 'Open connection settings', exact: true }).click()
    await expect(page).toHaveURL(/view=account&settings=connections/)
    const connections = page.locator('summary', { hasText: /^Connections$/ }).locator('..')
    await expect(connections).toHaveAttribute('open', '')
    await expect(connections.getByRole('button', { name: 'Connect with Strava', exact: true })).toBeVisible()
    await connections.getByText('How do my runs get into Strava?', { exact: true }).click()
    await expect(connections.getByText('Nike Run Club', { exact: true })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Main', exact: true })
    await expect(nav).toBeVisible()
    await nav.getByRole('button', { name: 'Runs', exact: true }).click()
    await expect(guide).toHaveAttribute('open', '')
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      // Help stays open when the mobile panel moves into the desktop split view.
      await expect(page.locator('.runs-split')).toHaveCount(width >= 1024 ? 1 : 0)
      await expect(guide).toHaveAttribute('open', '')
      const help = guide.locator('details.device-guide')
      if (await help.getAttribute('open') === null) await help.locator(':scope > summary').click()
      const nike = guide.locator('[data-run-source=nike]')
      if (!await nike.getAttribute('open').then(value => value !== null)) await nike.locator('summary').click()
      await expect(guide.getByText(/Settings → Partners → Strava/)).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const mark = guide.getByRole('img', { name: 'Powered by Strava' })
      if (mode === 'dark') { await expect(mark.locator('.strava-powered-screen')).toBeVisible(); await expect(mark.locator('.strava-powered-print')).toBeHidden() }
      else { await expect(mark.locator('.strava-powered-print')).toBeVisible(); await expect(mark.locator('.strava-powered-screen')).toBeHidden() }
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
    await expect(guide.getByRole('button', { name: 'Open connection settings', exact: true })).toBeVisible()
    await expect(nav).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('phone runner can reach the existing manual training log without a recording @phone', async ({ page }) => {
  await mockApi(page, true)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
  await page.getByText('Connect through Strava', { exact: true }).click()
  await page.getByRole('button', { name: 'Open my training plan', exact: true }).click()
  // Manual logging lives on the day: today's here.
  await page.getByRole('button', { name: /^Sunday 18 October 2026:/ }).click()
  await page.getByRole('button', { name: /Open day details/ }).click()
  await page.getByRole('button', { name: 'Log a run', exact: true }).click()
  await expect(page.getByLabel('Distance (km)', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Run details', { exact: true })).toBeVisible()
})

for (const mode of ['light', 'dark']) {
  test(`imports appear without a plan, failed refresh retains recordings and retry/reload recover in ${mode} mode @phone`, async ({ page }, info) => {
    const imports: Imports = { status: { ...connected }, runs: [], catchUps: 0 }
    await mockApi(page, false, imports)
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(page.getByText('Importing recordings · 1 check remaining.')).toBeVisible()
    await expect.poll(() => imports.catchUps).toBe(1)
    imports.runs = [{ id: 'phone-recording', startedAt: '2026-10-18T06:00:00Z', localDate: '2026-10-18',
      kind: 'Run', distanceKm: 5, movingSeconds: 1800, paceSecondsPerKm: 360, plannedTitle: null,
      plannedSessionType: null, pace: null, averageHeartRate: null,
      source: { kind: 'Strava', addedAt: '2026-10-18T12:00:00Z', cachedUntil: '2026-10-25T12:00:00Z' } } as ActivitySummary]
    imports.status = { ...connected, pending: 0, syncedRuns: 1, lastSyncedAt: '2026-10-18T12:00:00Z' }
    await page.clock.runFor(15_000)
    const recording = page.locator('.run-feed-row')
    await expect(recording).toHaveCount(1)
    await expect(recording).toContainText('5 km')
    await expect(recording).toContainText('30:00')
    await expect(page.getByText(/1 synced recording available/)).toBeVisible()
    await expect(page.getByText('No recordings yet.', { exact: true })).toHaveCount(0)
    imports.failRuns = true
    imports.failStatus = true
    await page.getByRole('button', { name: 'Check for runs', exact: true }).click()
    await expect(page.getByText(/Your recordings could not refresh/)).toBeVisible()
    await expect(page.getByText(/Automatic imports could not be checked/)).toBeVisible()
    await expect(recording).toHaveCount(1)
    imports.failRuns = false
    imports.failStatus = false
    await page.getByRole('button', { name: 'Try import check again', exact: true }).click()
    await expect(page.getByText(/Your recordings could not refresh/)).toHaveCount(0)
    await expect(page.getByText(/Automatic imports could not be checked/)).toHaveCount(0)
    await expect(recording).toHaveCount(1)
    await page.reload()
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(recording).toHaveCount(1)
    await page.evaluate(() => document.fonts.ready)
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
    if (info.project.name === 'desktop') {
      await page.setViewportSize({ width: 375, height: 900 })
      await mkdir(qa, { recursive: true })
      await page.screenshot({ path: `${qa}/synced-375-${mode}.png`, fullPage: true })
    }
  })
}

test('import issues require reconnect or retry rather than reporting an empty successful sync @phone', async ({ page }) => {
  const imports: Imports = { status: { ...connected, pending: 0, status: 'NeedsReconnect' }, runs: [], catchUps: 0 }
  await mockApi(page, false, imports)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
  await expect(page.getByRole('button', { name: 'Reconnect Strava', exact: true })).toBeVisible()
  expect(imports.catchUps).toBe(0)
  imports.failRuns = true
  imports.failStatus = true
  await page.reload()
  await expect(page.getByText('We couldn’t load your runs.', { exact: true })).toBeVisible()
  await expect(page.getByText('No recordings yet.', { exact: true })).toHaveCount(0)
  imports.failRuns = false
  imports.failStatus = false
  imports.status = { ...connected, available: false, connected: false, status: null, pending: 0 }
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await page.getByRole('button', { name: 'Try import check again', exact: true }).click()
  await expect(page.getByText(/Automatic Strava imports are currently unavailable/)).toBeVisible()
  expect(imports.catchUps).toBe(0)
  await expect(page.getByText('Add runs from a file', { exact: true })).toBeVisible()
})

test('a skipped recording gains an explanation when pending work completes even though the list stays empty @phone', async ({ page }) => {
  const imports: Imports = { status: { ...connected }, runs: [], catchUps: 0 }
  await mockApi(page, false, imports)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
  await expect(page.getByText('Importing recordings · 1 check remaining.')).toBeVisible()
  imports.issues = [{ stravaActivityId: '12345', skipped: true, at: '2026-10-18T12:00:00Z',
    reason: 'Strava did not share usable time and distance recording samples for this run.' }]
  imports.status = { ...connected, pending: 0 }
  await page.clock.runFor(15_000)
  await expect(page.getByText('1 recording skipped', { exact: false })).toBeVisible()
  await page.getByText('Your run data', { exact: false }).click()
  await expect(page.getByRole('heading', { name: 'Runs from Strava that didn’t arrive', exact: true })).toBeVisible()
  await expect(page.getByText(/Strava did not share usable time and distance recording samples/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Strava run,/ })).toHaveAttribute('href', 'https://www.strava.com/activities/12345')
})

test('Strava setup stays concise with app and watch instructions closed by default @phone', async ({ page }, info) => {
  await mockApi(page)
  await page.setViewportSize({ width: 375, height: 900 })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=runs')
  const guide = page.locator('details.phone-runs')
  await guide.locator(':scope > summary').click()
  const help = guide.locator('details.device-guide')
  await expect(help).not.toHaveAttribute('open', '')
  await expect(guide.getByText('Nike Run Club', { exact: true })).toBeHidden()
  await expect(guide.getByText('A free Strava account is enough.', { exact: true })).toBeVisible()
  await expect(guide.getByRole('button', { name: 'Open connection settings', exact: true })).toBeVisible()
  for (const mode of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await page.evaluate(() => document.fonts.ready)
    const mark = guide.getByRole('img', { name: 'Powered by Strava' })
    await expect(mark).toBeVisible()
    if (mode === 'dark') await expect(mark.locator('.strava-powered-screen')).toBeVisible()
    else await expect(mark.locator('.strava-powered-print')).toBeVisible()
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(audit.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    if (info.project.name === 'desktop') {
      await mkdir(qa, { recursive: true })
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.screenshot({ path: `${qa}/strava-setup-375-${mode}.png`, fullPage: true })
    }
  }
})
