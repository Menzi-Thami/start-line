import { expect, test, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { TrainingPlan } from '../src/lib/types'
import { mockApi } from './perf-api'

// Continuous evidence includes the complete successful story, not only failure traces.
test.use({ video: 'on' })

const baseline = process.env.RELEASE_QA_BASELINE === '1'
const fixture = `http://127.0.0.1:${process.env.RELEASE_QA_FIXTURE_PORT ?? '5176'}/e2e/fixtures/${baseline ? 'journey' : 'release-readiness'}.html`
const PLAN_BUILD_TIMEOUT_MS = 30_000 // The user-visible recovery budget, checked independently of the implementation.
const evidence = fileURLToPath(new URL(`../../docs/qa/2026-11-24/release-readiness/${baseline ? 'before' : 'after'}/`, import.meta.url))
const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8')) as TrainingPlan
const summary = { id: 'perf-plan', name: 'Synthetic 5K', raceName: plan.race.name, raceDate: plan.race.date, status: 'Active', createdAt: '2026-10-01T10:00:00Z' }

async function capture(page: Page, path: string) {
  await page.evaluate(async () => { await document.fonts.ready; (document.activeElement as HTMLElement | null)?.blur(); scrollTo(0, 0) })
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

async function audit(page: Page, info: TestInfo, screen: string) {
  if (info.project.name === 'desktop-firefox') {
    info.annotations.push({ type: 'accessibility', description: 'Firefox axe crash tracked in e2e/axe.ts; geometry and semantic assertions still run.' })
    return
  }
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  await info.attach(`${screen}-accessibility.json`, { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(result.passes.length).toBeGreaterThan(0)
  expect(result.violations.map(value => ({ id: value.id, targets: value.nodes.map(node => node.target) }))).toEqual([])
}

async function prepare(page: Page) {
  const api = await mockApi(page, { latencyMs: 5 })
  const state = { holdGeneration: false, holdSave: false, generated: 0, saves: [] as { expectedPlanId: string; plan: unknown }[],
    releaseGeneration: () => {}, releaseSave: () => {} }
  await page.route('**/api/v1/plans', async route => {
    state.generated++
    if (state.holdGeneration) await new Promise<void>(resolve => { state.releaseGeneration = resolve })
    await route.fulfill({ json: plan }).catch(() => undefined) // A deliberately timed-out request may already be cancelled.
  })
  await page.route('**/api/v1/me/plans', async route => {
    if (route.request().method() !== 'POST') { await route.fallback(); return }
    state.saves.push(route.request().postDataJSON())
    if (state.holdSave) await new Promise<void>(resolve => { state.releaseSave = resolve })
    await route.fulfill({ json: summary }).catch(() => undefined)
  })
  await page.goto(`${fixture}?view=home`)
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
  await api.settle()
  await page.getByRole('button', { name: 'View this week', exact: true }).click()
  await page.getByRole('button', { name: 'Edit plan', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Build my plan', exact: true })).toBeVisible()
  return state
}

test.describe('complete plan-building story', () => {
  test('the original film opens the generated plan and finishes its save @phone', async ({ page }) => {
    const state = await prepare(page)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
    const story = page.getByRole('status', { name: 'Building your training plan' })
    await expect(story).toBeVisible()
    await expect(story.getByRole('heading', { name: 'Through the tape' })).toBeVisible({ timeout: 22_000 })
    await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(story).toHaveCount(0)
    await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
    await expect(page.locator('.plan-calendar')).toBeVisible()
    expect(state.generated).toBe(1)
    expect(state.saves).toHaveLength(1)
    expect(state.saves[0]!.expectedPlanId).toBe('perf-plan')
  })
})

for (const theme of ['light', 'dark']) test(`combined run and strength stay separate with one strength title: ${theme} @phone`, async ({ page }, info) => {
  await mockApi(page, { latencyMs: 5 })
  await page.clock.setSystemTime(new Date('2026-10-19T12:00:00Z'))
  const combined = structuredClone(plan)
  const week = combined.weeks[1]!
  const run = week.sessions.find(session => session.type !== 'Strength')!
  Object.assign(run, { date: '2026-10-19', type: 'Easy', title: 'Easy run', zone: 'Easy', distanceKm: 6,
    detail: 'Run 6 km at an easy, conversational effort.', purpose: 'Build aerobic endurance while leaving your legs fresh.', steps: [] })
  await page.route('**/api/v1/me/plans/perf-plan', route => route.fulfill({ json: { ...summary, plan: combined, inputs: {
    raceSlug: null, raceName: plan.race.name, raceDate: plan.race.date, distanceKm: 5, goalTime: '00:24:30',
    runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: ['Monday'], planFrom: plan.startDate, version: 3,
  }, coaching: [] } }))
  await page.route('**/api/v1/me/plans/perf-plan/coach', route => route.fulfill({ json: { plan: combined, coaching: [] } }))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(value => localStorage.setItem('taperday:theme', value), theme)
  await page.goto(`${fixture}?view=home`)
  await page.getByRole('button', { name: 'View this week', exact: true }).click()
  await page.locator('.week-day-button[data-date="2026-10-19"]').click()
  await page.getByRole('button', { name: /Open day details/ }).click()
  const day = page.locator('.day-summary')
  await expect(day).toBeVisible()
  await expect(day.getByRole('checkbox', { name: /Squat, set/ })).toHaveCount(0)
  const move = day.getByRole('button', { name: 'Move this run', exact: true })
  const log = day.getByRole('button', { name: 'Log how this run went', exact: true })
  for (const width of [320, 375, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const a = await move.boundingBox(), b = await log.boundingBox()
    if (!a || !b) throw new Error('Both independent run actions must be visible')
    expect(a.height).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  if (!baseline) await audit(page, info, `run-${theme}`)
  if (process.env.RELEASE_QA_CAPTURE === '1' && info.project.name === 'desktop') { mkdirSync(evidence, { recursive: true }); await capture(page, `${evidence}run-390-${theme}.png`) }
  await day.getByRole('button', { name: 'Open strength workouts', exact: true }).click()
  const strength = page.locator('.strength-session').first()
  await strength.locator('summary').click()
  if (!baseline) {
    expect((await strength.textContent())!.split('Strength & mobility').length - 1).toBe(1)
    await expect(page.getByText('Set ticks are saved on this device.', { exact: true })).toBeVisible()
    await expect(strength).toContainText('finish with 5 min of mobility')
  }
  const set = strength.getByRole('checkbox', { name: /Squat, set 1 of/ })
  await set.check()
  await expect(strength.locator('summary')).toContainText('1/18 sets done')
  if (!baseline) await audit(page, info, `strength-${theme}`)
  if (process.env.RELEASE_QA_CAPTURE === '1' && info.project.name === 'desktop') await capture(page, `${evidence}strength-390-${theme}.png`)
  await page.reload()
  await page.getByRole('tab', { name: 'Strength', exact: true }).click()
  await page.locator('.strength-session').first().locator('summary').click()
  await expect(page.getByRole('checkbox', { name: /Squat, set 1 of/ }).first()).toBeChecked()
})

test('refreshing an interrupted edit restores changed answers without resubmitting @phone', async ({ page }) => {
  const state = await prepare(page)
  await page.getByRole('button', { name: 'Change goal', exact: true }).click()
  await page.getByLabel('Minutes', { exact: true }).press('ArrowUp')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.locator('.review')).toContainText('25:30')
  state.holdGeneration = true
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect.poll(() => state.generated).toBe(1)
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me/plans/perf-plan')
  await page.reload()
  await loaded
  await expect(page.getByRole('heading', { name: 'Check and build', exact: true })).toBeVisible()
  await expect(page.locator('.review')).toContainText('25:30')
  expect(state.generated).toBe(1)
  expect(state.saves).toHaveLength(0)
  state.holdGeneration = false
  state.releaseGeneration()
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible()
  expect(state.generated).toBe(2)
  expect(state.saves).toHaveLength(1)
  expect(state.saves[0]).toMatchObject({ expectedPlanId: 'perf-plan', plan: { goalTime: '00:25:30' } })
  expect(new URL(page.url()).searchParams.has('editingPlan')).toBe(false)
})

test('a restored draft cannot silently replace a different current plan @phone', async ({ page }) => {
  const state = await prepare(page)
  state.holdGeneration = true
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect.poll(() => state.generated).toBe(1)
  await page.evaluate(() => {
    const url = new URL(location.href)
    url.searchParams.set('editingPlan', 'another-plan')
    history.replaceState(null, '', url)
  })
  const loaded = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me/plans/perf-plan')
  await page.reload()
  await loaded
  await expect(page.getByRole('button', { name: 'Build my plan', exact: true })).toBeVisible()
  state.holdGeneration = false
  state.releaseGeneration()
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible()
  expect(state.generated).toBe(2)
  expect(state.saves).toHaveLength(0)
})

test('a hung generator ends with retained answers and an explicit retry @phone', async ({ page }) => {
  const state = await prepare(page)
  state.holdGeneration = true
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await page.clock.runFor(PLAN_BUILD_TIMEOUT_MS + 50)
  const error = page.getByRole('alert').filter({ hasText: 'We couldn’t build that plan.' })
  await expect(error).toContainText('Your answers are still here')
  await expect(page.getByRole('status', { name: 'Building your training plan' })).toHaveCount(0)
  expect(state.saves).toHaveLength(0)
  expect(state.generated).toBe(1)
  state.holdGeneration = false
  state.releaseGeneration()
  await error.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible()
  expect(state.generated).toBe(2)
  expect(state.saves).toHaveLength(1)
  expect(state.saves[0]!.expectedPlanId).toBe('perf-plan')
})

test('a stalled edited-plan save is bounded and retries the same plan identity @phone', async ({ page }) => {
  const state = await prepare(page)
  state.holdSave = true
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect.poll(() => state.saves.length).toBe(1)
  await page.clock.runFor(PLAN_BUILD_TIMEOUT_MS + 50)
  const error = page.getByRole('alert').filter({ hasText: 'We couldn’t build that plan.' })
  await expect(error).toContainText('Check your saved plan')
  state.holdSave = false
  state.releaseSave()
  await error.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible()
  expect(state.saves).toHaveLength(2)
  expect(state.saves.map(value => value.expectedPlanId)).toEqual(['perf-plan', 'perf-plan'])
  expect(state.saves[1]!.plan).toEqual(state.saves[0]!.plan)
})

test('a late token after the build deadline cannot save an abandoned edit @phone', async ({ page }) => {
  const state = await prepare(page)
  await page.evaluate(() => { document.documentElement.dataset.qaHoldToken = 'true' })
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect.poll(() => state.generated).toBe(1)
  await page.clock.runFor(PLAN_BUILD_TIMEOUT_MS + 50)
  await expect(page.getByRole('alert').filter({ hasText: 'We couldn’t build that plan.' })).toBeVisible()
  await page.evaluate(() => { delete document.documentElement.dataset.qaHoldToken; dispatchEvent(new Event('qa:release-token')) })
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  expect(state.saves).toHaveLength(0)
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar', exact: true })).toBeVisible()
  expect(state.saves).toHaveLength(1)
})

test('leaving a pending plan cannot rewrite the selected destination later @phone', async ({ page }) => {
  await mockApi(page, { latencyMs: 5 })
  let release = () => {}
  await page.route('**/api/v1/plans', async route => {
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: plan }).catch(() => undefined)
  })
  await page.goto(`${fixture}?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-12&v=3`)
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Runs', exact: true }).click()
  release()
  await expect(page).toHaveURL(/view=runs/)
  await expect(page.getByRole('heading', { name: 'Runs', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Runs', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('browser Back cancels an edited-plan build before it can save @phone', async ({ page }) => {
  const state = await prepare(page)
  state.holdGeneration = true
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect.poll(() => state.generated).toBe(1)
  const cancelled = page.waitForEvent('requestfailed', { predicate: request => new URL(request.url()).pathname === '/api/v1/plans', timeout: 5_000 })
  await page.goBack()
  await cancelled
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
  state.releaseGeneration()
  expect(new URL(page.url()).searchParams.get('view')).toBe('home')
  expect(state.saves).toHaveLength(0)
})
