import { expect, test } from '@playwright/test'

const sharedPlan = () => {
  const today = new Date().toISOString().slice(0, 10)
  const race = new Date(Date.now() + 56 * 86400000).toISOString().slice(0, 10)
  return `/?km=10&date=${race}&name=Spring+10K&goal=3000&days=tu.th.sa.su&long=su&exp=regular&from=${today}`
}

test('training views fit phone, tablet, desktop and ultrawide screens @phone', async ({ page }) => {
  await page.goto(sharedPlan())
  await expect(page.getByRole('heading', { name: 'Spring 10K' })).toBeVisible()
  for (const width of [320, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    for (const name of ['This week', 'Calendar', 'Progress']) {
      await page.getByRole('tab', { name, exact: true }).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${name} at ${width}px`).toBeLessThanOrEqual(1)
      if (name === 'This week') {
        const date = page.locator('.week-day-button').first()
        await date.click()
        const day = page.locator('.day-summary')
        await expect(day).toBeVisible()
        await expect(day.getByRole('region', { name: 'Planned', exact: true })).toBeVisible()
        expect(await day.evaluate(element => element.scrollWidth - element.clientWidth), `Day summary at ${width}px`).toBeLessThanOrEqual(1)
        await page.keyboard.press('Escape')
        await expect(date).toBeFocused()
      }
    }
  }
})

test('chart inspection works by keyboard and reduced motion keeps controls still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(sharedPlan())
  await page.getByRole('tab', { name: 'Progress', exact: true }).click()
  const chart = page.getByRole('slider', { name: /Weekly distance/ })
  await chart.focus()
  await page.keyboard.press('End')
  const last = await chart.getAttribute('aria-valuemax')
  await expect(chart).toHaveAttribute('aria-valuenow', last!)
  await page.keyboard.press('Home')
  await expect(chart).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.press('Escape')
  await expect(page.locator('.volume-tooltip')).toHaveCount(0)
  const moving = await page.locator('main').evaluate((main) => main.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 1).length)
  expect(moving).toBe(0)
})
