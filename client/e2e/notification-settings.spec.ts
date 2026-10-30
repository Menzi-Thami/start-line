import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { NotificationPreferences } from '../src/lib/types'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
const endpoint = 'https://fcm.googleapis.com/fcm/send/synthetic-notification-test'
const preferences: NotificationPreferences = {
  runCongratulations: true, trainingReviews: false, longRunPreparation: false, racePreparation: false,
  connectionAlerts: false, preparationAt: '18:00:00', quietStart: null, quietEnd: null,
}

async function setup(page: Page) {
  await page.addInitScript(({ endpoint }) => {
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: async () => ({ pushManager: { getSubscription: async () => ({
        endpoint, getKey: (name: string) => new Uint8Array(name === 'auth' ? 16 : 65).buffer,
      }) } }) },
    })
  }, { endpoint })
  const key = createHash('sha256').update(endpoint).digest('hex')
  let saved = { ...preferences }
  let fail = false
  const inputs = { raceName: 'Parkrun PB', distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', planFrom: '2026-10-08', version: 1, experience: 'Regular' }
  const summary = { id: 'notification-plan', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }
  const device = () => ({ id: 'notification-device', deviceKey: key, remindAt: '06:00:00', weekAhead: true, daily: true, createdAt: '2026-10-08T09:00:00Z', preferences: saved })
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'notification-runner', displayName: 'Alex', email: 'alex@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false }
    else if (path === '/api/v1/plans') data = plan
    else if (path === '/api/v1/me/plans') data = [summary]
    else if (path.endsWith('/coach') || path === '/api/v1/me/plans/notification-plan') data = { ...summary, inputs, plan, coaching: [] }
    else if (path.endsWith('/photo')) data = { dataUrl: null }
    else if (path.endsWith('/strava')) data = { available: true, connected: false }
    else if (path.endsWith('/reminders')) data = { available: true, publicKey: 'synthetic-key', devices: [device()] }
    else if (path.endsWith('/reminders/devices') && request.method() === 'PUT') {
      if (fail) return route.fulfill({ status: 503, json: { title: 'Temporarily unavailable' } })
      saved = request.postDataJSON().preferences
      data = device()
    }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date('2026-10-18T08:00:00Z') })
  return { saved: () => saved, fail: (value: boolean) => { fail = value } }
}

test('notification choices survive reload and recover from a failed save @phone', async ({ page }, info) => {
  const state = await setup(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/plan-edit.html?view=account')
  await page.getByText('Notifications', { exact: true }).click()
  const review = page.getByRole('checkbox', { name: 'Training adjustments ready to review' })
  await expect(page.getByRole('switch', { name: 'Reminders on this device' })).toBeChecked()
  await expect(review).not.toBeChecked()
  state.fail(true)
  await review.click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(review).not.toBeChecked()
  state.fail(false)
  await review.check()
  await expect(review).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Preparation the evening before a long run' }).check()
  await expect(review).toBeEnabled()
  await page.getByRole('checkbox', { name: 'A checklist the evening before race day' }).check()
  await expect(review).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Quiet hours' }).check()
  await expect(review).toBeEnabled()
  expect(state.saved().quietStart).toBe('22:00:00')
  await page.reload()
  await page.getByText('Notifications', { exact: true }).click()
  await expect(review).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Quiet hours' })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: /missed run/i })).toHaveCount(0)
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.locator('fieldset.notification-choices').screenshot({ path: info.outputPath(`notification-settings-${width}.png`) })
  }
})

test('push destinations open preparation, weekly review and connection details @phone', async ({ page }, info) => {
  await setup(page)
  const base = 'http://127.0.0.1:5176/e2e/fixtures/plan-edit.html'
  await page.goto(`${base}?view=plan&prepare=race`)
  await expect(page.getByRole('heading', { name: 'Prepare for Parkrun PB' })).toBeVisible()
  await expect(page.getByRole('table')).toContainText('24:30')
  await page.locator('.preparation-card').screenshot({ path: info.outputPath('race-preparation.png') })
  await page.goto(`${base}?view=home&review=1`)
  await expect(page.locator('.home-review')).toHaveAttribute('open', '')
  await expect(page.getByRole('heading', { name: 'Weekly review', exact: true })).toBeVisible()
  await page.goto(`${base}?view=account&settings=connections`)
  const connections = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Connections & run sources' }) })
  await expect(connections).toHaveAttribute('open', '')
})
