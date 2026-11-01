import { expect, test, type Page } from '@playwright/test'

const runner = { id: 'shoes', displayName: 'Shoe QA', timeZone: 'Africa/Johannesburg', units: 'Kilometres', weeklyEmails: false, consentedAt: '2026-10-08T09:00:00Z', privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, heartRateConsent: true }

/** The real app with synthetic sign-in, and a shoes API that remembers what the runner does. */
async function mockApi(page: Page) {
  const state = {
    shoes: [{ id: 'p1', name: 'Pegasus 41', startingKm: 100, limitKm: 700, totalKm: 655.5, runs: 48, stravaKm: 0, lastRunOn: '2026-10-29', isDefault: true, remindAtLimit: true, retired: false, wear: 'NearingLimit' }],
    created: [] as unknown[],
  }
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/v1/me') return route.fulfill({ json: runner })
    if (path === '/api/v1/me/shoes' && request.method() === 'POST') {
      const body = request.postDataJSON() as { name: string; startingKm: number; limitKm: number }
      state.created.push(body)
      const shoe = { id: 'p2', name: body.name, startingKm: body.startingKm, limitKm: body.limitKm, totalKm: body.startingKm, runs: 0, stravaKm: 0, lastRunOn: null, isDefault: false, remindAtLimit: true, retired: false, wear: 'Fine' }
      state.shoes = [...state.shoes, shoe]
      return route.fulfill({ status: 201, json: shoe })
    }
    if (path === '/api/v1/me/shoes') return route.fulfill({ json: state.shoes })
    if (path.endsWith('/strava')) return route.fulfill({ json: { available: false, connected: false, status: null, includesPrivateRuns: false, connectedAt: null, lastSyncedAt: null, pending: 0, failed: 0, syncedRuns: 0 } })
    return route.fulfill({ json: [] })
  })
  return state
}

test('a runner sees a pair nearing its limit and adds a new pair from the reminder link @phone', async ({ page }) => {
  const state = await mockApi(page)
  // The reminder's link opens Account with Shoes already open.
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/plan-edit.html?view=account&settings=shoes')

  const shoes = page.locator('section.shoes')
  await expect(shoes.getByRole('meter', { name: 'Pegasus 41: distance towards its limit' })).toBeVisible()
  await expect(shoes.getByText('Nearing its limit')).toBeVisible()

  await shoes.getByRole('button', { name: 'Add a pair' }).click()
  await shoes.getByLabel('Name').fill('Clifton 9')
  await shoes.getByRole('button', { name: 'Add pair' }).click()

  await expect(shoes.getByText('Added Clifton 9.')).toBeVisible()
  await expect(shoes.getByText('Clifton 9', { exact: true })).toBeVisible()
  expect(state.created).toHaveLength(1)

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `shoes at ${width}px`).toBeLessThanOrEqual(1)
  }
})
