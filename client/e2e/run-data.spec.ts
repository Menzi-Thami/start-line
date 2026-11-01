import { expect, test, type Page } from '@playwright/test'

const runner = { id: 'run-data', displayName: 'Data QA', timeZone: 'Africa/Johannesburg', units: 'Kilometres', weeklyEmails: false, consentedAt: '2026-10-08T09:00:00Z', privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, heartRateConsent: true }
const source = (kind: 'Upload' | 'Strava', fileName: string | null = null) => ({
  kind, viewUrl: kind === 'Strava' ? 'https://www.strava.com/activities/9' : null, recordedOnGarmin: false,
  cachedUntil: kind === 'Strava' ? '2026-11-05T06:00:00Z' : null, format: kind === 'Upload' ? 'Fit' : null, fileName,
  fetchedAt: kind === 'Strava' ? '2026-10-29T06:00:00Z' : null, addedAt: '2026-10-29T06:00:00Z',
})
const summary = (id: string, km: number, kind: 'Upload' | 'Strava', fileName: string | null = null) => ({
  id, startedAt: '2026-10-29T04:00:00Z', localDate: '2026-10-29', kind: 'Run', distanceKm: km, movingSeconds: km * 330,
  paceSecondsPerKm: 330, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: 150, source: source(kind, fileName),
})

/** The real app with synthetic sign-in, and a run-data API that changes as the runner resolves things. */
async function mockApi(page: Page) {
  const state = { runs: [summary('upload', 10.02, 'Upload', 'morning.fit'), summary('strava', 10, 'Strava')], kept: false, deleted: [] as string[] }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/me') return route.fulfill({ json: runner })
    if (path === '/api/v1/me/activities') return route.fulfill({ json: state.runs })
    if (path === '/api/v1/me/run-data/delete') {
      const ids = (request.postDataJSON() as { activityIds: string[] }).activityIds
      state.deleted.push(...ids)
      state.runs = state.runs.filter((r) => !ids.includes(r.id))
      return route.fulfill({ json: { deleted: ids.length } })
    }
    if (path === '/api/v1/me/run-data') {
      const pair = state.runs.length === 2 && !state.kept ? [{ first: state.runs[0], second: state.runs[1], relation: 'SameRun' }] : []
      return route.fulfill({
        json: {
          sources: { uploads: 1, fit: 1, gpx: 0, tcx: 0, unknownFormat: 0, strava: 1, stravaConnected: true, stravaStatus: 'Active', lastSyncedAt: '2026-10-29T06:00:00Z', stravaPending: 0 },
          totals: [{ period: 'week', from: '2026-10-26', to: '2026-10-29', totalKm: 10.02, runs: 1, tickedKm: 0, tickedRuns: 0, uploadedKm: 10.02, uploadedRuns: 1, stravaKm: 0, stravaRuns: 0, withoutDistance: 0 }],
          possibleDuplicates: pair,
          missing: { runs: state.runs.length, withoutHeartRate: 0, withoutElevation: 0, withoutSplits: 0, heartRateConsent: true },
          syncIssues: [],
        },
      })
    }
    if (path.endsWith('/strava')) return route.fulfill({ json: { available: true, connected: true, status: 'Active', includesPrivateRuns: false, connectedAt: null, lastSyncedAt: null, pending: 0, failed: 0, syncedRuns: 1 } })
    return route.fulfill({ json: [] })
  })
  return state
}

test('a runner sees what their total is made of and deletes a duplicate copy @phone', async ({ page }) => {
  const state = await mockApi(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/plan-edit.html?view=runs')

  const panel = page.locator('details.run-data')
  await expect(panel.locator('summary')).toContainText('1 thing to check')
  await panel.locator('summary').click()
  await expect(panel.getByRole('table', { name: 'This week: where the total comes from' })).toBeVisible()
  await expect(panel.getByText('Looks like the same run twice')).toBeVisible()

  const stravaCopy = panel.locator('.run-data-pair-run').filter({ hasText: 'Strava' })
  await stravaCopy.getByRole('button', { name: 'Delete this one' }).click()

  await expect(panel.getByRole('status')).toContainText('Deleted the')
  await expect(panel.getByText('Looks like the same run twice')).toHaveCount(0)
  expect(state.deleted).toEqual(['strava'])
  await expect(page.locator('.run-feed-row')).toHaveCount(1)

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `run data at ${width}px`).toBeLessThanOrEqual(1)
  }
})
