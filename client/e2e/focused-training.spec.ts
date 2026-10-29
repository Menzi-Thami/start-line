import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { CheckIn } from '../src/lib/types'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

// Actual App and screens, synthetic account/API data only. SQL persistence is covered independently.
test('training stays focused while all detail remains reachable @phone', async ({ page }, info) => {
  const inputs = { raceName: 'Parkrun PB', distanceKm: 5, raceDate: '2026-12-13', goalTime: '00:24:30', runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', strengthDays: ['Monday'], planFrom: '2026-10-08', version: 1, experience: 'Regular' }
  const summary = { id: 'focus-plan', name: 'Parkrun PB', raceName: 'Parkrun PB', raceDate: '2026-12-13', createdAt: '2026-10-08T09:00:00Z', status: 'Active' }
  const activity = { id: 'focus-run', localDate: '2026-10-18', startedAt: '2026-10-18T06:00:00Z', kind: 'Run', distanceKm: 10, movingSeconds: 4199, paceSecondsPerKm: 419.9, source: { kind: 'Strava', cachedUntil: '2026-10-25T06:00:00Z' } }
  let entries: CheckIn[] = []
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'focus-runner', displayName: 'Alex', email: 'alex@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false }
    else if (path === '/api/v1/plans') data = plan
    else if (path === '/api/v1/me/plans') data = [summary]
    else if (path.endsWith('/coach') || path === '/api/v1/me/plans/focus-plan') data = { ...summary, inputs, plan, coaching: [] }
    else if (path.includes('/check-ins')) {
      if (request.method() === 'PUT') {
        const parts = path.split('/')
        const body = request.postDataJSON()
        entries = [{ ...body, id: 'focus-entry', date: parts.at(-2), sessionType: parts.at(-1), isAdditional: false, prescribedKm: 6, updatedAt: '2026-10-18T08:00:00Z' } as CheckIn]
        data = entries[0]
      } else data = entries
    } else if (path.endsWith('/activities')) data = [activity]
    else if (path.endsWith('/running')) data = [{ date: '2026-10-18', distanceKm: 10, source: 'Strava', distanceUnreported: false }]
    else if (path.endsWith('/strava')) data = { available: true, connected: true, status: 'Active', connectedAt: '2026-10-10T09:00:00Z', syncedRuns: 1, pending: 0, failed: 0, includesPrivateRuns: false }
    else if (path.endsWith('/photo')) data = { dataUrl: null }
    else if (path.endsWith('/reminders')) data = { available: false }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date('2026-10-18T08:00:00Z') })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/plan-edit.html?view=home')
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toContainText('Long run')
  await page.evaluate(() => document.fonts.ready)
  await expect(page.getByRole('tablist', { name: 'Home', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log this workout', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Log a run', exact: true })).toHaveCount(0)
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(4)
  for (const name of ['Home', 'Plan', 'Runs', 'Account']) await expect(navigation.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Personal bests', exact: true })).toHaveCount(0)
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`focused-home-${width}.png`) })
  }
  const tools = page.locator('summary').filter({ hasText: /^Running tools/ })
  await tools.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Calculators', exact: true })).toBeVisible()
  await tools.click()
  await page.locator('summary').filter({ hasText: /^Running insights/ }).click()
  await expect(page.getByRole('region', { name: 'Personal bests', exact: true })).toBeVisible()
  await page.locator('summary').filter({ hasText: /^Running insights/ }).click()
  await page.getByRole('button', { name: 'Open your plan', exact: true }).click()
  await expect(page.getByRole('tablist', { name: 'Your plan', exact: true }).getByRole('tab')).toHaveText(['This week', 'Calendar', 'Progress'])
  await expect(page.locator('#plan-panel-week .days')).toHaveCount(0)
  const sunday = page.getByRole('button', { name: /^Sunday 18 October 2026:/ })
  await sunday.click()
  const day = page.getByRole('region', { name: 'Sunday 18 October 2026', exact: true })
  await expect(day.getByRole('region', { name: 'Planned', exact: true })).toContainText('6 km')
  await expect(day.getByRole('region', { name: 'Recorded', exact: true })).toContainText('10 km')
  await day.getByRole('checkbox', { name: 'Complete', exact: true }).click()
  await day.getByLabel('Run details').selectOption('focus-run')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
  expect(entries).toHaveLength(1)
  await expect(day.locator('.run-result')).toHaveCount(1)
  await page.setViewportSize({ width: 375, height: 812 })
  await day.screenshot({ path: info.outputPath('focused-day.png') })
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  await sunday.click()
  await page.keyboard.press('Escape')
  await expect(sunday).toBeFocused()
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(() => scrollTo(0, 0))
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`focused-plan-${width}.png`) })
  }
  const strength = page.locator('summary').filter({ hasText: /^Strength workouts$/ })
  await strength.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Change strength days', exact: true })).toBeVisible()
  await strength.click()
  await navigation.getByRole('button', { name: 'Runs', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Open the run on/ })).toBeVisible()
  await expect(page.getByText('Upload runs', { exact: true })).not.toBeVisible()
  await page.locator('summary').filter({ hasText: /^Add runs from a file$/ }).click()
  await expect(page.getByText('Upload runs', { exact: true })).toBeVisible()
  await navigation.getByRole('button', { name: 'Account', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByText('Profile & picture', { exact: true }).click()
  const profileName = page.getByRole('textbox', { name: 'What should we call you?', exact: true })
  await expect(profileName).toBeVisible()
  await profileName.fill('Alex Runner')
  await page.getByText('Profile & picture', { exact: true }).click()
  await page.getByText('Data & privacy', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Download my data', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Delete my account', exact: true }).click()
  await page.getByRole('button', { name: 'Keep my account', exact: true }).click()
  await page.getByText('Profile & picture', { exact: true }).click()
  await expect(profileName).toHaveValue('Alex Runner')
})
