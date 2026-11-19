import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { journeyOf } from '../src/features/journey/journey-fixtures'

// Before/after evidence for the Runs simplification. Only runs when asked (SIMPLIFY_RUNS_CAPTURE=1), so CI is unaffected.
// Before captures use SIMPLIFY_RUNS_BASELINE=1 on the staging code; after captures use the branch.
const capture = process.env.SIMPLIFY_RUNS_CAPTURE === '1'
const baseline = process.env.SIMPLIFY_RUNS_BASELINE === '1'
const recording = JSON.parse(readFileSync(new URL('../src/test/fixtures/activity-tempo.json', import.meta.url), 'utf8'))
const root = fileURLToPath(new URL(`../../docs/qa/2026-11-18/simplify-runs/${baseline ? 'before' : 'after'}/`, import.meta.url))
const fixture = 'http://127.0.0.1:5176/e2e/fixtures/journey.html'
const today = '2026-10-20'

const summary = (id: string, localDate: string, km: number, seconds: number, source: object, plannedTitle: string | null = null) => ({
  id, localDate, startedAt: `${localDate}T06:00:00Z`, kind: 'Run', distanceKm: km, movingSeconds: seconds, paceSecondsPerKm: seconds / km,
  plannedTitle, shoe: null, source,
})
const strava = { kind: 'Strava', viewUrl: 'https://www.strava.com/activities/9007199254740993', cachedUntil: '2027-01-01T00:00:00Z', recordedOnGarmin: false }
const upload = { kind: 'Upload', format: 'Fit', addedAt: '2026-10-18T09:00:00Z' }
const runs = [
  summary('qa-strava', today, 8.4, 3000, strava, 'Easy run'),
  summary('qa-upload', '2026-10-18', 8.6, 3436, upload, 'Tempo run'),
  summary('qa-older', '2026-10-12', 15.2, 5700, upload),
]

async function mock(page: Page) {
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'synthetic-runs-runner', displayName: 'Naledi', email: 'runs@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21', maxHeartRate: 190 }
    else if (path === '/api/v1/me/activities') data = runs
    else if (path === '/api/v1/me/activities/qa-upload') data = { ...recording, id: 'qa-upload', localDate: '2026-10-18', source: upload }
    else if (path.startsWith('/api/v1/me/activities/')) data = { ...recording, id: path.split('/').at(-1), source: strava }
    else if (path === '/api/v1/me/running') data = runs.map(run => ({ date: run.localDate, distanceKm: run.distanceKm, source: run.source.kind === 'Strava' ? 'Strava' : 'Uploaded', distanceUnreported: false }))
    else if (path === '/api/v1/me/run-data') data = { sources: { uploads: 2, fit: 2, gpx: 0, tcx: 0, unknownFormat: 0, strava: 1, stravaConnected: true, stravaStatus: 'Active', stravaPending: 0, lastSyncedAt: '2026-10-20T06:30:00Z' }, totals: [], syncIssues: [], missing: { runs: 3, withoutHeartRate: 0, withoutElevation: 0, withoutSplits: 0, heartRateConsent: true } }
    else if (path === '/api/v1/me/journey') data = journeyOf([])
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/strava') || path.endsWith('/catch-up')) data = { available: true, connected: true, status: 'Active', includesPrivateRuns: true, syncedRuns: 1, pending: 0, failed: 0, lastSyncedAt: '2026-10-20T06:30:00Z' }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date(`${today}T08:00:00Z`) })
}

async function shoot(page: Page, name: string, mode: 'light' | 'dark', prepare?: () => Promise<void>) {
  mkdirSync(root, { recursive: true })
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    // Phone and desktop layouts mount their own Runs list, so open state is set again at each width.
    await prepare?.()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${root}${name}-${width}-${mode}.png`, fullPage: true, animations: 'disabled' })
  }
}

for (const mode of ['light', 'dark'] as const) {
  test(`Runs, Add runs and a run page: ${mode}`, async ({ page }) => {
    test.skip(!capture, 'Evidence capture only')
    await mock(page)
    await page.addInitScript(value => localStorage.setItem('taperday:theme', value), mode)
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto(`${fixture}?view=runs`)
    await expect(page.locator('.run-feed-open').first()).toBeVisible()
    await shoot(page, 'runs', mode)

    await shoot(page, 'add-runs', mode, async () => {
      if (baseline) {
        // Both import disclosures expanded, as a runner looking for a way to add runs would see them.
        await page.evaluate(() => { for (const details of document.querySelectorAll<HTMLDetailsElement>('details.phone-runs, details.upload')) details.open = true })
      } else if (await page.getByRole('button', { name: 'Add runs', exact: true }).getAttribute('aria-expanded') !== 'true') {
        await page.getByRole('button', { name: 'Add runs', exact: true }).click()
      }
    })

    await page.goto(`${fixture}?view=runs&run=qa-upload&returnTo=${encodeURIComponent('?view=runs')}`)
    await expect(page.getByRole('region', { name: 'Run summary' })).toBeVisible()
    await shoot(page, 'run-page', mode)
  })
}
