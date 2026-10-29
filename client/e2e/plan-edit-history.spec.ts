import { openPlanOptions, openStrengthWorkouts, openDisclosure } from './navigation'
import { expect, test } from '@playwright/test'
import type { CheckIn, CheckInRequest, GeneratePlanRequest, TrainingPlan } from '../src/lib/types'

// Source variants share deterministic prescriptions. Reuse generated fixtures rather than exhaust the API's real limiter.
const generated = new Map<string, TrainingPlan>()

for (const mode of ['manual', 'time-only', 'tick', 'strava']) {
  test(`Wednesday ${mode} history survives changed days, strength, a failed save and a new start @phone`, async ({ page, request }, info) => {
    const inputs: GeneratePlanRequest = { raceName: 'History 10K', distanceKm: 10, raceDate: '2026-12-13', goalTime: '00:52:00', runDays: ['Monday', 'Wednesday', 'Friday', 'Sunday'], longRunDay: 'Sunday', currentWeeklyKm: 25, experience: 'Regular', strengthDays: [], planFrom: '2026-10-08', version: 2 }
    const generate = async (body: GeneratePlanRequest) => {
      const key = JSON.stringify(body)
      const cached = generated.get(key)
      if (cached) return cached
      const response = await request.post('http://localhost:5122/api/v1/plans', { data: body })
      expect(response.status(), await response.text()).toBe(200)
      const plan = await response.json() as TrainingPlan
      generated.set(key, plan)
      return plan
    }
    let current = { id: 'history-plan', name: 'History 10K', createdAt: '2026-10-08T09:00:00Z', status: 'Active', inputs, plan: await generate(inputs), coaching: [] }
    let entries: CheckIn[] = []
    let saves = 0
    let failSave = false
    const session = current.plan.weeks.flatMap(week => week.sessions).find(item => item.date === '2026-10-28' && item.type !== 'Strength')!
    const activity = { id: 'source-run', localDate: '2026-10-28', startedAt: '2026-10-28T06:00:00Z', kind: 'Run', distanceKm: 10, movingSeconds: 4199, paceSecondsPerKm: 419.9, source: { kind: 'Strava', cachedUntil: '2026-11-05T06:00:00Z' } }
    await page.route('**/api/v1/**', async route => {
      const req = route.request()
      const path = new URL(req.url()).pathname
      let data: unknown = []
      if (path === '/api/v1/plans') data = await generate(req.postDataJSON())
      else if (path === '/api/v1/races') data = []
      else if (path === '/api/v1/me') data = { id: 'history-runner', displayName: 'History QA', timeZone: 'Africa/Johannesburg', units: 'Kilometres', weeklyEmails: false, consentedAt: '2026-10-08T09:00:00Z', privacyNoticeVersion: '2026-10-21', needsPrivacyConsent: false, heartRateConsent: false }
      else if (path === '/api/v1/me/plans' && req.method() === 'GET') data = [{ ...current, raceName: 'History 10K', raceDate: '2026-12-13' }]
      else if (path === '/api/v1/me/plans' && req.method() === 'POST') {
        if (failSave) { await route.fulfill({ status: 503, json: { status: 503, title: 'Save failed. Try again.' } }); return }
        const body = req.postDataJSON()
        expect(body.expectedPlanId).toBe('history-plan')
        expect(body.replaceCurrent).toBe(true)
        current = { ...current, inputs: body.plan, plan: await generate(body.plan) }
        saves++
        data = { ...current, raceName: 'History 10K', raceDate: '2026-12-13' }
      } else if (path.includes('/check-ins')) {
        if (req.method() === 'PUT') {
          const parts = path.split('/')
          const body = req.postDataJSON() as CheckInRequest
          const existing = entries.find(entry => entry.date === parts.at(-2) && entry.sessionType === parts.at(-1))
          const entry = { ...body, pain: body.pain ?? 'None', painArea: null, effort: body.effort ?? null, date: parts.at(-2), sessionType: parts.at(-1), id: existing?.id ?? 'wednesday-log', isAdditional: false, prescribedKm: session.distanceKm, updatedAt: '2026-10-29T09:00:00Z' } as CheckIn
          entries = [entry]
          data = entry
        } else data = entries
      } else if (path.endsWith('/coach') || path === '/api/v1/me/plans/history-plan') data = current
      else if (path.endsWith('/activities')) data = mode === 'strava' ? [activity] : []
      else if (path.endsWith('/running')) data = entries.map(entry => ({ date: entry.date, distanceKm: entry.distanceKm ?? (mode === 'strava' ? 10 : mode === 'tick' ? session.distanceKm : 0), distanceUnreported: mode === 'time-only' && entry.distanceKm == null, source: mode === 'strava' ? 'Strava' : 'Ticked' }))
      else if (path.endsWith('/strava')) data = { connected: false }
      await route.fulfill({ json: data })
    })
    await page.clock.install({ time: new Date('2026-10-29T08:00:00Z') })
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/plan-edit.html?km=10&date=2026-12-13&name=History+10K&goal=3120&days=mo.we.fr.su&long=su&now=25&exp=regular&from=2026-10-08&v=2')
    await expect(page.getByRole('heading', { name: 'History 10K', exact: true })).toBeVisible()
    const dayButton = () => page.getByRole('button', { name: /^Wednesday 28 October 2026:/ })
    await dayButton().click()
    const day = page.getByRole('region', { name: 'Wednesday 28 October 2026', exact: true })
    await day.getByRole('checkbox', { name: 'Complete', exact: true }).click()
    if (mode === 'strava') await day.getByLabel('Run details').selectOption('source-run')
    if (mode === 'manual') await day.getByLabel('Distance (km)', { exact: true }).fill('10')
    if (mode === 'manual' || mode === 'time-only') await day.getByLabel('Minutes', { exact: true }).fill('45')
    if (mode === 'tick') await day.getByRole('button', { name: /without details/i }).click()
    else await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
    expect(entries).toHaveLength(1)
    await day.getByRole('button', { name: 'Close day', exact: true }).click()
    await openPlanOptions(page)
    await page.getByRole('button', { name: 'Change answers', exact: true }).click()
    await page.getByRole('button', { name: /Change days/ }).click()
    const days = page.getByRole('group', { name: 'Which days can you run?', exact: true })
    await days.getByRole('checkbox', { name: 'Wednesday', exact: true }).uncheck()
    await days.getByRole('checkbox', { name: 'Thursday', exact: true }).check()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByText('Add strength and mobility sessions', { exact: true }).click()
    await page.getByRole('group', { name: 'Strength days', exact: true }).getByRole('checkbox', { name: 'Monday', exact: true }).check()
    failSave = true
    await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    expect(saves).toBe(0)
    expect(current.inputs.runDays).toContain('Wednesday')
    expect(new URL(page.url()).searchParams.get('days')).toBe('mo.we.fr.su')
    expect(entries).toHaveLength(1)
    failSave = false
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'History 10K', exact: true })).toBeVisible()
    expect(saves).toBe(1)
    expect(current.inputs.runDays).not.toContain('Wednesday')
    expect(current.inputs.strengthDays).toContain('Monday')
    await dayButton().click()
    await expect(day.getByRole('region', { name: 'Recorded', exact: true })).toContainText(mode === 'time-only' ? 'Distance not recorded' : mode === 'tick' ? 'prescribed at completion' : '10 km')
    await expect(day.getByRole('region', { name: 'Recorded', exact: true }).locator('.run-result')).toHaveCount(1)
    await day.screenshot({ path: info.outputPath(`retained-${mode}.png`) })
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'History 10K', exact: true })).toBeVisible()
    await dayButton().click()
    await expect(day.getByRole('region', { name: 'Recorded', exact: true }).locator('.run-result')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await openPlanOptions(page)
    await page.getByRole('button', { name: 'Change answers', exact: true }).click()
    await page.getByRole('button', { name: 'Change goal', exact: true }).click()
    const goalMinutes = page.getByRole('group', { name: 'Goal finish time', exact: true }).getByLabel('Minutes', { exact: true })
    await expect(goalMinutes).toHaveValue('52')
    await goalMinutes.fill('50')
    await expect(goalMinutes).toHaveValue('50')
    await page.getByRole('group', { name: 'Goal finish time', exact: true }).screenshot({ path: info.outputPath('keyboard-time-entry.png') })
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('radio', { name: /^Another day/ }).check()
    await page.getByRole('button', { name: 'Start on', exact: true }).click()
    const datePicker = page.getByRole('dialog', { name: 'Choose a date', exact: true })
    await datePicker.getByRole('button', { name: 'Next month', exact: true }).click()
    await datePicker.getByRole('button', { name: 'Monday 2 November 2026', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Build my plan', exact: true }).dblclick()
    await expect(page.getByRole('heading', { name: 'History 10K', exact: true })).toBeVisible()
    expect(saves).toBe(2)
    expect(entries).toHaveLength(1)
    expect(current.inputs.startOn).toBe('2026-11-02')
    await openDisclosure(page, /^Earlier logged runs/)
    await expect(page.getByRole('region', { name: 'Earlier logged runs', exact: true })).toContainText('Wednesday 28 October')
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    await page.getByRole('region', { name: 'Your plan by month', exact: true }).getByRole('button', { name: /^28 October:/ }).click()
    await expect(day.getByRole('region', { name: 'Recorded', exact: true }).locator('.run-result')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await openStrengthWorkouts(page)
    const strength = page.locator('.strength-session').first()
    await expect(strength).not.toHaveAttribute('open', '')
    expect(await strength.getByRole('checkbox').count()).toBe(0)
    await strength.locator('summary').first().focus()
    await page.keyboard.press('Enter')
    await expect(strength.getByRole('checkbox').first()).toBeVisible()
    await strength.getByRole('checkbox').first().check()
    await strength.locator('summary').first().focus()
    await page.keyboard.press('Enter')
    await expect(strength.locator('summary').first()).toContainText('1/')
    expect(await strength.getByRole('checkbox').count()).toBe(0)
    for (const width of [375, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      if (mode === 'manual') {
        await strength.evaluate(element => element.scrollIntoView({ block: 'center' }))
        await strength.screenshot({ path: info.outputPath(`strength-${width}.png`) })
      }
    }
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')))
    await expect(strength).toHaveAttribute('open', '')
    await expect(strength.getByRole('checkbox').first()).toBeVisible()
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
    await expect(strength).not.toHaveAttribute('open', '')
  })
}
