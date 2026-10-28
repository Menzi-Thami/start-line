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

/** Hold a real API response so the loading screen can be inspected without adding a production delay. */
async function holdBuild(page: Page) {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/api/v1/plans', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    await pending
    await route.fulfill({ response })
  })
  return release
}

test('submitted options open a dedicated loading screen with keyboard tips at every width @phone', async ({ page }, info) => {
  await reviewPlan(page)
  const theatre = page.getByRole('complementary', { name: 'Running tips' })
  await expect(theatre).toHaveCount(0)
  const release = await holdBuild(page)
  await page.getByRole('button', { name: 'Build my plan' }).click()
  await expect(page.getByRole('form', { name: 'Build your plan' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Building your plan…' })).toBeFocused()
  await expect(theatre).toBeVisible()
  await expect(page.getByRole('button', { name: /pause|play animation/i })).toHaveCount(0)
  const first = await theatre.getByRole('status').innerText()
  await theatre.getByRole('button', { name: 'Next tip' }).focus()
  await page.keyboard.press('Enter')
  await expect(theatre.getByRole('status')).not.toHaveText(first)
  for (const width of [375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await theatre.getByRole('button', { name: 'Next tip' }).click()
    await page.locator('.plan-loading').screenshot({ path: info.outputPath(`plan-loading-${width}.png`) })
  }
  release()
  await expect(page.getByRole('heading', { name: 'Two Oceans Ultra', exact: true })).toBeVisible()
  await expect(theatre).toHaveCount(0)
})

test('the loading film plays automatically without playback controls and responds to reduced motion', async ({ page }) => {
  await reviewPlan(page)
  const release = await holdBuild(page)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByRole('button', { name: 'Build my plan' }).click()
  const theatre = page.getByRole('complementary', { name: 'Running tips' })
  await expect(theatre).toBeVisible()
  await expect(theatre.locator('.wait-caption')).toHaveText('Recovery is training')
  await expect(page.getByRole('button', { name: /pause|play animation/i })).toHaveCount(0)
  await expect(theatre.locator('.wait-caption')).toHaveText('On your marks', { timeout: 6000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(theatre).toHaveClass(/is-motion-reduced/)
  const caption = await theatre.locator('.wait-caption').textContent()
  await page.waitForTimeout(4200)
  await expect(theatre.locator('.wait-caption')).toHaveText(caption!)
  expect(await theatre.evaluate((node) => node.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length)).toBe(0)
  release()
  await expect(page.getByRole('heading', { name: 'Two Oceans Ultra', exact: true })).toBeVisible()
})

test('strength has its own workout cards and stays out of the run count @phone', async ({ page }) => {
  const today = new Date().toISOString().slice(0, 10)
  const race = new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10)
  await page.goto(`/?km=10&date=${race}&name=Strength+check&goal=3000&days=tu.th.sa.su&long=su&gym=mo.we&exp=regular&from=${today}&v=2`)
  await expect(page.getByRole('heading', { name: 'Strength check' })).toBeVisible()
  const strength = page.locator('.session-strength').first()
  await expect(strength).toBeVisible()
  await expect(strength).toContainText('Strength')
  await expect(strength).toContainText('exercises')
  await expect(strength.getByText('About this session', { exact: true })).toBeVisible()
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
  await page.getByRole('tab', { name: 'Strength', exact: true }).click()
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
