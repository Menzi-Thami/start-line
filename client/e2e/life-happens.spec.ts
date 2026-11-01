import { expect, test } from '@playwright/test'

test('a runner moves the long run to a safe day, previewed before it applies, at every width @phone', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/life-happens.html')
  const life = page.locator('details.life-happens')
  await life.locator('> summary').click()
  await life.getByRole('button', { name: 'Move my long run' }).click()
  await life.getByRole('button', { name: 'Show what changes' }).click()
  await life.getByRole('group', { name: 'Move to' }).getByRole('button').nth(1).click()
  await expect(life.getByText(/Long run moves from/)).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `life happens at ${width}px`).toBeLessThanOrEqual(1)
  }

  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await life.screenshot({ path: `../docs/qa/142/life-happens-${scheme}-${size}.png`, animations: 'disabled' })
  }
})
