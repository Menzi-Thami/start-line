import { openStrengthWorkouts } from './navigation'
import { expect, test, type Page } from '@playwright/test'
import type { TrainingPlan } from '../src/lib/types'

async function reviewPlan(page: Page) {
  await page.goto('/')
  await page.locator('label.race-bib').filter({ hasText: 'Two Oceans' }).click()
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('group', { name: 'Goal finish time' }).getByLabel('Hours').fill('6')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
}

test('the existing runner film starts on Build, not on review, and does not delay a ready plan @phone', async ({ page }, info) => {
  await reviewPlan(page)
  await expect(page.getByRole('status', { name: 'Building your training plan' })).toHaveCount(0)

  let releaseRequest!: () => void
  const holdRequest = new Promise<void>((resolve) => { releaseRequest = resolve })
  await page.route('**/api/v1/plans', async (route) => {
    await holdRequest
    await route.continue()
  })

  await page.getByRole('button', { name: 'Build my plan' }).click()
  const theatre = page.getByRole('status', { name: 'Building your training plan' })
  await expect(theatre).toBeVisible()
  await expect(theatre.locator('.wait-runner')).toBeVisible()
  await expect(theatre.getByRole('button', { name: 'Next tip' })).toHaveCount(0)
  await expect(theatre.getByRole('button', { name: 'Pause animation' })).toHaveCount(0)

  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await theatre.screenshot({ path: info.outputPath(`plan-building-${width}.png`) })
  }

  releaseRequest()
  await expect(page.getByRole('heading', { name: 'Two Oceans Ultra', exact: true })).toBeVisible()
  await expect(theatre).toHaveCount(0)
})

test('plan-building runner respects reduced motion without extra controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await reviewPlan(page)

  let releaseRequest!: () => void
  const holdRequest = new Promise<void>((resolve) => { releaseRequest = resolve })
  await page.route('**/api/v1/plans', async (route) => {
    await holdRequest
    await route.continue()
  })
  await page.getByRole('button', { name: 'Build my plan' }).click()

  const theatre = page.getByRole('status', { name: 'Building your training plan' })
  await expect(theatre.locator('.wait-scene-finish')).toBeVisible()
  expect(await theatre.evaluate((node) => node.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0)
  releaseRequest()
  await expect(page.getByRole('heading', { name: 'Two Oceans Ultra', exact: true })).toBeVisible()
})

test('strength has its own workout cards and stays out of the run count @phone', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10)
  const race = new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10)
  await page.goto(`/?km=10&date=${race}&name=Strength+check&goal=3000&days=tu.th.sa.su&long=su&gym=mo.we&exp=regular&from=${today}&v=2`)
  await expect(page.getByRole('heading', { name: 'Strength check' })).toBeVisible()
  await openStrengthWorkouts(page)
  const strength = page.locator('.strength-session').first()
  await strength.locator('summary').first().click()
  await expect(strength).toBeVisible()
  await expect(strength).toContainText('Strength')
  await expect(strength).toContainText('exercises')
  await expect(strength.getByRole('checkbox').first()).toBeVisible()
  await expect(strength).not.toContainText('How to run it')
  await expect(strength).not.toContainText('/km')
  await expect(page.locator('.week-glance-value').nth(1)).toHaveText('4')
})

test('adding strength to a plan with a past custom start preserves its running schedule @phone', async ({ page }) => {
  const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  const built = iso(-21)
  const start = iso(-14)
  const response = page.waitForResponse((r) => r.url().endsWith('/api/v1/plans') && r.request().method() === 'POST')
  await page.goto(`/?km=10&date=${iso(56)}&name=Keep+my+schedule&goal=3000&days=tu.th.sa.su&long=su&gym=mo&exp=regular&from=${built}&start=${start}&v=2`)
  const original = await (await response).json() as TrainingPlan
  await openStrengthWorkouts(page)
  await page.getByRole('button', { name: 'Change strength days' }).click()
  await expect(page.getByRole('complementary', { name: 'Running tips' })).toHaveCount(0)
  const days = page.getByRole('group', { name: 'Strength days' })
  await expect(days.getByRole('checkbox', { name: 'Monday' })).toBeChecked()
  await days.getByRole('checkbox', { name: 'Monday' }).uncheck()
  await expect(days.getByRole('checkbox', { name: 'Monday' })).toBeVisible()
  await days.getByRole('checkbox', { name: 'Monday' }).check()
  await days.getByRole('checkbox', { name: 'Wednesday' }).check()
  const rebuilt = page.waitForResponse((r) => r.url().endsWith('/api/v1/plans') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Build my plan' }).click()
  const updated = await (await rebuilt).json() as TrainingPlan
  await expect(page.getByRole('heading', { name: 'Keep my schedule' })).toBeVisible()
  const running = (plan: TrainingPlan) => plan.weeks.flatMap((w) => w.sessions).filter((s) => s.type !== 'Strength')
  expect(running(updated)).toEqual(running(original))
  const query = new URL(page.url()).searchParams
  expect(query.get('from')).toBe(built)
  expect(query.get('start')).toBe(start)
  expect(query.get('v')).toBe('2')
  expect(query.get('gym')).toBe('mo.we')
})
