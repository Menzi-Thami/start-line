import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { addDays } from '../src/lib/format'
import { fromRequest, toSearchParams } from '../src/lib/plan-url'
import type { GeneratePlanRequest, TrainingPlan } from '../src/lib/types'
import { chapter, journeyOf, maintenance, PLAN_ID, raceResult, recap, recovery } from '../src/features/journey/journey-fixtures'
import type { RecoveryPlan, SaveRaceResult, StartRecovery } from '../src/features/journey/types'

const fixture = 'http://127.0.0.1:5176/e2e/fixtures/journey.html'
const qa = fileURLToPath(new URL('../../docs/qa/2026-11-15/phase-handoff/', import.meta.url))
const homeQa = fileURLToPath(new URL('../../docs/qa/2026-11-15/home-simplicity/', import.meta.url))
const nextId = '22222222-2222-4222-8222-222222222222'
const recording = { id: '33333333-3333-4333-8333-333333333333', localDate: '2026-11-14', startedAt: '2026-11-14T05:00:00Z', kind: 'Run', distanceKm: 20.3,
  movingSeconds: 7200, elapsedSeconds: 7575, paceSecondsPerKm: 355, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
  source: { kind: 'Strava', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } }

async function setup(page: Page, options: { finished?: boolean; recovering?: boolean; future?: boolean; raceDay?: boolean } = {}) {
  const seed = JSON.parse(await readFile(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8')) as TrainingPlan
  const old = { ...seed, race: { ...seed.race, name: 'Hoka Half', date: '2026-11-14', distanceKm: 21.1 }, startDate: addDays(seed.startDate, -29),
    weeks: seed.weeks.map(week => ({ ...week, startDate: addDays(week.startDate, -29), sessions: week.sessions.map(session => ({ ...session, date: addDays(session.date, -29) })) })) }
  const inputs: GeneratePlanRequest = { raceName: 'Hoka Half', raceDate: old.race.date, distanceKm: 21.1, goalTime: '01:45:00',
    runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', strengthDays: [], planFrom: old.startDate, version: 1, experience: 'Regular' }
  const stored = raceResult({ raceDate: old.race.date, finishTime: '02:06:15', distanceKm: 20.3, timeKind: 'RecordedElapsed', activityId: recording.id })
  const state = { result: options.finished || options.recovering ? stored : null as ReturnType<typeof raceResult> | null,
    recovery: options.recovering ? recovery({ eventName: 'Hoka Half', raceDate: old.race.date, distanceKm: 20.3 }) : null as RecoveryPlan | null,
    maintenance: null as ReturnType<typeof maintenance> | null,
    starts: [] as StartRecovery[], results: [] as SaveRaceResult[], checks: [] as unknown[], trainingReads: 0, detailsReads: 0 }
  const training = () => chapter({ raceName: 'Hoka Half', raceDate: old.race.date, status: 'Concluded', lifecycle: 'Concluded', raceResult: state.result,
    training: recap({ allConfirmed: false, scheduledRuns: 10, confirmedRuns: 4, raceDatePassed: true }), achievements: [] })
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let data: unknown = []
    if (path === '/api/v1/me/running') { state.detailsReads++; data = [] }
    else if (path === '/api/v1/me/beginner') { await route.fulfill({ status: 204 }); return }
    else if (path === '/api/v1/me') data = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: 'journey@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21' }
    // Deliberately stale Active from an older server/cache: the local race date must still end training.
    else if (path === '/api/v1/me/plans') data = [{ id: PLAN_ID, name: 'Hoka Half', raceName: 'Hoka Half', raceDate: old.race.date, status: 'Active' },
      ...(options.future ? [{ id: nextId, name: seed.race.name, raceName: seed.race.name, raceDate: seed.race.date, status: 'Active' }] : [])]
    else if (path === `/api/v1/me/plans/${PLAN_ID}` || path === `/api/v1/me/plans/${PLAN_ID}/coach`) { state.trainingReads++; data = { id: PLAN_ID, name: 'Hoka Half', status: 'Active', inputs, plan: old, coaching: [] } }
    else if (path === `/api/v1/me/plans/${nextId}` || path === `/api/v1/me/plans/${nextId}/coach`) data = { id: nextId, name: seed.race.name, status: 'Active', inputs: { ...inputs, distanceKm: 5, raceName: seed.race.name, raceDate: seed.race.date }, plan: seed, coaching: [] }
    else if (path === '/api/v1/plans') data = request.postDataJSON().raceDate === seed.race.date ? seed : old
    else if (path === '/api/v1/me/journey') data = journeyOf([...(options.future ? [chapter({ planId: nextId, raceName: seed.race.name, raceDate: seed.race.date, lifecycle: 'Active', training: recap({ trainingEnded: false, raceDatePassed: false }) })] : []), training()], { recovery: state.recovery, maintenance: state.maintenance })
    else if (path === `/api/v1/me/journey/plans/${PLAN_ID}`) data = training()
    else if (path === `/api/v1/me/journey/plans/${PLAN_ID}/race-result` && request.method() === 'PUT') {
      const body = request.postDataJSON() as SaveRaceResult
      state.results.push(body); state.result = raceResult({ ...body, raceDate: body.raceDate ?? old.race.date }); data = state.result
    } else if (path === '/api/v1/me/journey/recovery' && request.method() === 'POST') {
      const body = request.postDataJSON() as StartRecovery
      state.starts.push(body)
      state.recovery ??= recovery({ ...body, eventName: body.eventName ?? 'Hoka Half', runDays: inputs.runDays })
      data = state.recovery
    } else if (path.endsWith(`/recovery/${recovery().id}/check-ins`) && request.method() === 'POST') {
      const body = request.postDataJSON()
      state.checks.push(body)
      state.recovery = { ...state.recovery!, readiness: body.feeling, canComplete: body.feeling === 'GoodToGo', checkIns: [{ ...body, redFlags: body.redFlags ?? [], note: null }] }; data = state.recovery
    } else if (path.endsWith(`/recovery/${recovery().id}`) && request.method() === 'PATCH') {
      expect(request.postDataJSON().action).toBe('Complete')
      state.recovery = { ...state.recovery!, status: 'Completed', endedOn: '2026-11-15' }; data = state.recovery
    } else if (path === '/api/v1/me/journey/maintenance' && request.method() === 'POST') {
      state.maintenance = maintenance(request.postDataJSON()); data = state.maintenance
    } else if (path === '/api/v1/me/journey/maintenance' && request.method() === 'DELETE') {
      state.maintenance = null; await route.fulfill({ status: 204 }); return
    } else if (path === '/api/v1/me/journey/races') data = { races: [], majors: [] }
    else if (path === '/api/v1/me/activities') data = [recording]
    else if (path === `/api/v1/me/activities/${recording.id}`) data = recording
    else if (path.endsWith('/strava')) data = { available: true, connected: true, syncedRuns: 1, pending: 0, failed: 0 }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo') || path.endsWith('/celebrated')) { await route.fulfill({ status: 204 }); return }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date(options.raceDay ? '2026-11-14T21:59:50Z' : '2026-11-15T08:00:00Z') })
  if (options.raceDay) await page.clock.pauseAt(new Date('2026-11-14T21:59:59Z'))
  return { state, historyUrl: `${fixture}?${toSearchParams(fromRequest(inputs)!)}` }
}

async function accessible(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}

async function calmHome(page: Page) {
  // Assert one atomic DOM state, including hidden leftovers.
  const home = await page.evaluate(() => {
    const root = document.querySelector('.home')!
    return {
      oldPanels: root.querySelectorAll('.home-top, .home-sync, .home-strava-invite, .first-week, #home-goal, #beginner-home-heading').length,
      repeatQuestions: /Add training feedback|Something to run towards\?|Couch to 5K/.test(root.textContent ?? ''),
      chapters: root.querySelectorAll('.home-focus > .journey-home').length,
      detailsOpen: root.querySelector('.home-more')?.hasAttribute('open'),
    }
  })
  expect(home).toEqual({ oldPanels: 0, repeatQuestions: false, chapters: 1, detailsOpen: false })
}

test('race day ends at the runner’s midnight without assuming a result or starting recovery @phone', async ({ page }, info) => {
  const { state } = await setup(page, { raceDay: true })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi', level: 1 })).toBeVisible()
  await expect(page.getByText('Training concluded', { exact: true })).toHaveCount(0)
  await page.clock.runFor(1200)
  await expect(page.getByText('Training concluded', { exact: true })).toBeVisible()
  await expect(page.getByText('Your training chapter is saved in Journey.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start recovery plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(state.results).toEqual([]); expect(state.starts).toEqual([])
  await page.clock.resume()
  await calmHome(page)
  if (info.project.name === 'desktop') {
    await mkdir(qa, { recursive: true })
    for (const mode of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await accessible(page)
      await page.screenshot({ path: `${qa}/home-concluded-375-${mode}.png`, fullPage: true })
    }
  }
  await page.reload()
  await expect(page.getByText('Training concluded', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Review my race', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'We found your Hoka Half.', exact: true })).toBeVisible()
  expect(state.results).toEqual([])
  await expect(page.getByText('✓ Race finisher', { exact: true })).toHaveCount(0)
})

test('concluded training → saved recording → separate recovery → Home/Plan/reload → next chapter @phone', async ({ page }, info) => {
  const { state } = await setup(page)
  await page.goto(`${fixture}?view=home`)
  await page.getByRole('button', { name: 'Review my race', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'We found your Hoka Half.', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm my recorded finish', exact: true }).dblclick()
  await expect(page.getByRole('dialog', { name: 'RACE FINISHED.' })).toContainText('2:06:15')
  await page.getByRole('button', { name: 'Back to my journey', exact: true }).click()
  expect(state.results).toHaveLength(1)
  expect(state.results[0]).toMatchObject({ finishTime: '02:06:15', distanceKm: 20.3, timeKind: 'RecordedElapsed', activityId: recording.id })
  await page.getByRole('button', { name: 'Plan recovery from this race', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
  await expect(page.locator('.race-result, .training-story')).toHaveCount(0)
  await expect(page.getByLabel('Distance (km)', { exact: true })).toHaveCount(0)
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start recovery plan', exact: true })).toBeVisible()
  await calmHome(page)
  await expect(page.locator('.journey-home button')).toHaveCount(1)
  expect(state.starts).toHaveLength(0)
  if (info.project.name === 'desktop') {
    await mkdir(homeQa, { recursive: true })
    await page.setViewportSize({ width: 375, height: 812 })
    for (const mode of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await accessible(page)
      await page.screenshot({ path: `${homeQa}/race-confirmed-375-${mode}.png`, fullPage: true })
    }
  }
  await page.getByRole('button', { name: 'Start recovery plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Start my recovery', exact: true }).dblclick()
  await expect(page.getByRole('button', { name: 'Good to go', exact: true })).toBeVisible()
  expect(state.starts).toHaveLength(1)
  expect(state.starts[0]).toMatchObject({ planId: PLAN_ID, eventName: 'Hoka Half', raceDate: '2026-11-14', distanceKm: 20.3 })
  expect(state.recovery?.id).not.toBe(PLAN_ID)
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open recovery plan', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Good to go', exact: true })).toHaveCount(0)
  await calmHome(page)
  if (info.project.name === 'desktop') {
    await mkdir(qa, { recursive: true })
    await page.setViewportSize({ width: 375, height: 812 })
    for (const mode of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await accessible(page)
      await page.screenshot({ path: `${qa}/home-recovery-375-${mode}.png`, fullPage: true })
    }
  }
  await nav.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
  expect(state.starts).toHaveLength(1)
  await page.getByRole('button', { name: 'Good to go', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Good to go', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(state.checks).toHaveLength(1)
  await page.getByRole('button', { name: 'I feel recovered', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose your next chapter.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Keep running comfortably/ }).click()
  await page.getByRole('button', { name: 'Start easy running', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your easy-running plan.', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open easy running', exact: true })).toBeVisible()
  await calmHome(page)
  if (info.project.name === 'desktop') {
    await mkdir(homeQa, { recursive: true })
    for (const mode of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await accessible(page)
      await page.screenshot({ path: `${homeQa}/maintenance-375-${mode}.png`, fullPage: true })
    }
  }
  await nav.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your easy-running plan.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop maintenance', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose your next chapter.', exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'Journey', exact: true }).click()
  await expect(page.getByText('Training concluded', { exact: true })).toBeVisible()
  await expect(page.locator('.journey-chapter-facts')).toContainText('Finished in 2:06:15')
})

test('recovery has its own days; concluded training is read-only, responsive and accessible @phone', async ({ page }, info) => {
  const { historyUrl } = await setup(page, { recovering: true, future: true })
  await page.goto(`${fixture}?view=recovery`)
  await expect(page.getByRole('button', { name: 'View training plan', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'View training plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Parkrun PB', exact: true, level: 2 })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true })
  await navigation.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open recovery plan', exact: true })).toBeVisible()
  await calmHome(page)
  await navigation.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
  if (info.project.name === 'desktop') await mkdir(qa, { recursive: true })
  for (const width of [375, 820, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
    await accessible(page)
    if (info.project.name === 'desktop') await page.screenshot({ path: `${qa}/recovery-${width}-${theme}.png`, fullPage: true })
  }
  await page.getByText('View recovery days', { exact: true }).click()
  await expect(page.getByRole('list', { name: 'Recovery plan days', exact: true }).getByRole('listitem')).toHaveCount(11)
  await page.goto(historyUrl)
  await expect(page.getByRole('heading', { name: 'Your training plan has concluded.', exact: true })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Your plan', exact: true })).toBeHidden()
  await page.getByRole('button', { name: 'View training plan', exact: true }).click()
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
  await expect(page.locator('.is-recovery')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Log a run', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Make this my plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save plan', exact: true })).toHaveCount(0)
  await accessible(page)
  await page.getByRole('button', { name: 'Hide training plan', exact: true }).click()
  if (info.project.name === 'desktop') {
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
    await accessible(page)
    for (const width of [375, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.screenshot({ path: `${qa}/training-concluded-${width}-dark.png`, fullPage: true })
    }
  }
})

test('easy-running Home offers Train for another race without opening maintenance @phone', async ({ page }) => {
  const { state } = await setup(page, { recovering: true })
  state.recovery = { ...state.recovery!, status: 'Completed', endedOn: '2026-11-24' }
  await page.clock.setFixedTime(new Date('2026-11-29T08:00:00Z'))
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('button', { name: 'Train for another race', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Choose what\'s next', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose your next chapter.', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Keep running comfortably/ }).click()
  await page.getByRole('button', { name: 'Start easy running', exact: true }).click()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open easy running', exact: true })).toBeVisible()
  for (const width of [375, 1440]) for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width, height: 900 })
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, theme)
    await expect(page.getByRole('button', { name: 'Open easy running', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Train for another race', exact: true })).toBeVisible()
    await accessible(page)
  }
  await page.getByRole('button', { name: 'Train for another race', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Which race?' })).toBeVisible()
  await expect(page).not.toHaveURL(/view=recovery/)
})

test('Home stays simple after recovery and months later, with running details available on request @phone', async ({ page }, info) => {
  const { state } = await setup(page, { recovering: true })
  state.recovery = { ...state.recovery!, status: 'Completed', endedOn: '2026-11-24' }
  await page.clock.setFixedTime(new Date('2026-11-29T08:00:00Z'))
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('button', { name: "Choose what's next", exact: true })).toBeVisible()
  expect(state.detailsReads).toBe(0)
  await calmHome(page)
  await page.locator('.home-more > summary').click()
  await page.locator('.home-insights > summary').click()
  await expect(page.getByRole('heading', { name: 'Your running', exact: true })).toBeVisible()
  await expect.poll(() => state.detailsReads).toBeGreaterThan(0)
  await page.locator('.home-tools > summary').click()
  await expect(page.getByRole('region', { name: 'Calculators', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Calculators', exact: true })).toBeVisible()
  state.recovery = null
  await page.clock.setFixedTime(new Date('2027-02-01T08:00:00Z'))
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('heading', { name: 'Take your time.', exact: true })).toBeVisible()
  await calmHome(page)
  if (info.project.name === 'desktop') {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
    await page.screenshot({ path: `${homeQa}/saved-history-375-dark.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'View my journey', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15', exact: true })).toBeVisible()
})

// Give every audit a fresh document at its final size, isolated from earlier
// layout queries and resizing (which can crash Firefox's native geometry checks).
for (const width of [320, 375, 820, 1440]) for (const mode of ['light', 'dark']) {
  test(`post-recovery Home is accessible at ${width}px in ${mode} mode @phone`, async ({ page }, info) => {
    const { state } = await setup(page, { recovering: true })
    state.recovery = { ...state.recovery!, status: 'Completed', endedOn: '2026-11-24' }
    await page.clock.setFixedTime(new Date('2026-11-29T08:00:00Z'))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${fixture}?view=home`)
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await expect(page.getByRole('button', { name: "Choose what's next", exact: true })).toBeVisible()
    expect(state.detailsReads).toBe(0)
    await accessible(page)
    if (info.project.name === 'desktop' && [375, 1440].includes(width)) {
      await mkdir(homeQa, { recursive: true })
      await page.screenshot({ path: `${homeQa}/recovered-${width}-${mode}.png`, fullPage: true })
    }
    await calmHome(page)
    expect(state.detailsReads).toBe(0)
  })
}


test('ending recovery offers a direct new-race action on Home and keeps recent activities in Runs @phone', async ({ page }, info) => {
  const { state } = await setup(page, { recovering: true })
  state.recovery = { ...state.recovery!, status: 'Ended', endedOn: '2026-11-18' }
  await page.clock.setFixedTime(new Date('2026-11-29T08:00:00Z'))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('button', { name: "Choose what's next", exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Train for another race', exact: true })).toBeVisible()
  await calmHome(page)
  await expect(page.locator('.journey-home button')).toHaveCount(2)
  expect(state.detailsReads).toBe(0)
  if (info.project.name === 'desktop') {
    await mkdir(homeQa, { recursive: true })
    for (const mode of ['light', 'dark']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await accessible(page)
      await page.screenshot({ path: `${homeQa}/recovery-ended-375-${mode}.png`, fullPage: true })
    }
  }
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await nav.getByRole('button', { name: 'Runs', exact: true }).click()
  await expect(page).toHaveURL(/view=runs/)
  await expect(page.getByText('20.3 km', { exact: true }).first()).toBeVisible()
  await nav.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('button', { name: "Choose what's next", exact: true })).toBeVisible()
  await calmHome(page)
  await page.getByRole('button', { name: "Choose what's next", exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose your next chapter.', exact: true })).toBeVisible()
})

for (const phase of ['Concluded', 'Recovering', 'Recovered']) {
  test(`Home stays the home destination on a fresh device after ${phase}, across reload and navigation @phone`, async ({ page }, info) => {
    const { state } = await setup(page, { recovering: phase !== 'Concluded' })
    if (phase === 'Recovered') state.recovery = { ...state.recovery!, status: 'Completed', endedOn: '2026-11-15' }
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(fixture)
    const greeting = page.getByRole('heading', { name: 'Welcome back, Naledi', level: 1, exact: true })
    const nav = page.getByRole('navigation', { name: 'Main', exact: true })
    await expect(greeting).toBeVisible()
    await expect(page).toHaveURL(/view=home/)
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'Which race?', exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toHaveCount(0)
    await calmHome(page)
    expect(state.starts).toEqual([])
    await page.reload()
    await expect(greeting).toBeVisible()
    const action = phase === 'Concluded' ? 'Review my race' : phase === 'Recovering' ? 'Open recovery plan' : "Choose what's next"
    await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible()
    await nav.getByRole('button', { name: 'Runs', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Taperday', exact: true }).click()
    await expect(greeting).toBeVisible()
    await expect(nav.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: action, exact: true })).toBeVisible()
    expect(state.starts).toEqual([])
    if (info.project.name === 'desktop') {
      const shots = fileURLToPath(new URL('../../docs/qa/2026-11-17/phone-runs/', import.meta.url))
      await mkdir(shots, { recursive: true })
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({ path: `${shots}/home-preserved-375-${phase.toLowerCase()}.png`, fullPage: true })
    }
  })
}
