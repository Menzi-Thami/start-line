import { expect, test, type Route } from '@playwright/test'
import { ownerOf } from '../src/lib/home-snapshot'
import { chapter, journeyOf, recap } from '../src/features/journey/journey-fixtures'

test.use({ serviceWorkers: 'block' })

test('cached Home → slow account → deadline → retry restores the saved chapter and navigation @phone', async ({ page }, info) => {
  const account = { name: 'Journey QA', email: 'journey@example.test' }
  const runner = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: account.email, timeZone: 'UTC', units: 'Kilometres',
    weeklyEmails: false, consentedAt: '2026-11-16T12:00:00Z', maxHeartRate: null, privacyNoticeVersion: '2026-10-21',
    needsPrivacyConsent: false, heartRateConsent: false, updateEmails: false, updateEmailsOffAt: null }
  await page.clock.install({ time: new Date('2026-11-16T12:00:00Z') })
  await page.addInitScript(({ owner, runner }) => {
    localStorage.setItem('startline:home', JSON.stringify({ v: 1, owner,
      snapshot: { savedAt: '2026-11-16T12:00:00Z', runner, current: null } }))
  }, { owner: ownerOf(account), runner })
  let recover = false
  const held: Route[] = []
  let accountReads = 0
  await page.route('**/health/**', route => route.fulfill({ body: 'Healthy' }))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') {
      accountReads++
      if (!recover) { held.push(route); return }
      data = { ...runner, displayName: 'Naledi online' }
    } else if (path === '/api/v1/me/journey') {
      data = journeyOf([chapter({ raceName: 'Hoka Half', raceDate: '2026-11-14', status: 'Concluded', lifecycle: 'Concluded',
        training: recap({ raceDatePassed: true, allConfirmed: false }), achievements: [] })])
    } else if (path === '/api/v1/me/journey/races') data = { races: [], majors: [] }
    else if (path.endsWith('/strava')) data = { available: false, connected: false }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    await route.fulfill({ json: data })
  })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi', exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(nav).toBeVisible()
  await expect.poll(() => held.length).toBe(1)
  await page.clock.runFor(6500)
  await expect(page.locator('.sign-in-wait').getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await page.clock.runFor(60_000)
  await expect(page.getByRole('alert')).toContainText('Your account is taking too long to load. Please try again.')
  await expect(page.getByText('Fetch is aborted', { exact: true })).toHaveCount(0)
  await expect(nav).toBeVisible()
  await expect(page.getByText('Something to run towards?', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('connection-run-timeout.png'), fullPage: true })
  for (const route of held) await route.abort().catch(() => undefined) // The browser may already have cancelled it.
  recover = true
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi online', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review my race', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.home-top')).toHaveCount(0)
  await expect(nav).toBeVisible()
  expect(accountReads).toBe(2)
  await page.screenshot({ path: info.outputPath('connection-run-recovered.png'), fullPage: true })
  await nav.getByRole('button', { name: 'Journey', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your journey.', exact: true })).toBeVisible()
})
