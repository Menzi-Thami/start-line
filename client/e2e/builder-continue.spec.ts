import { expect, test } from '@playwright/test'

// The rest of the suite runs with reduced motion, which switches off the page-entry animation that caused this: with
// motion on, a transform left behind on the page's first block pinned everything "fixed" inside it to the page, not the
// screen. The race step's Continue sat below the fold, and the plan-building screen opened above it (a blank screen).
test.use({ reducedMotion: 'no-preference' })

test('after arriving from another page, Continue and the plan-building screen stay on screen @phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 760 })
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/plans', async (route) => {
    if (route.request().method() === 'POST') await held
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Privacy policy' }).first().click()
  await expect(page).toHaveURL(/view=privacy/)
  await page.goBack()
  const arrived = page.locator('main.view-enter > :first-child')
  await expect(arrived).toHaveCount(1)
  // Once the entry animation has played, nothing is left that would trap fixed elements.
  await expect.poll(() => arrived.evaluate((element) => getComputedStyle(element).transform)).toBe('none')

  await page.locator('label.race-bib').filter({ hasText: 'Two Oceans' }).click()
  const form = page.getByRole('form', { name: 'Build your plan' })
  await expect(form).toHaveAttribute('data-race-selected', 'true')
  await expect(form.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport({ ratio: 1 })

  await form.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('group', { name: 'Goal finish time' }).getByLabel('Hours').fill('6')
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
  await page.getByRole('button', { name: 'Build my plan' }).click()
  await expect(page.locator('.plan-build-loading')).toBeInViewport({ ratio: 1 })
  release()
})
