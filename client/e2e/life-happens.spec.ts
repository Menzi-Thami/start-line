import { expect, test } from '@playwright/test'

test('a runner moves a missed key session through Change my plan, previewed before it applies, at every width @phone', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/life-happens.html')
  const change = page.locator('details.change-plan')
  await change.locator('> summary').click()
  await expect(change.getByRole('group', { name: 'What happened?' }).getByRole('button')).toHaveText(['Missed a run', 'Short on time', 'Travelling', 'Feeling unwell', 'Rebuild from today'])
  await change.getByRole('button', { name: 'Missed a run' }).click()
  await change.getByRole('button', { name: 'Show what changes' }).click()
  await change.getByRole('group', { name: 'Move to' }).getByRole('button').nth(1).click()
  await expect(change.getByText(/Fartlek moves from/)).toBeVisible()
  await expect(change.getByText('This is a preview. Your plan hasn’t changed.')).toBeVisible()

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `change my plan at ${width}px`).toBeLessThanOrEqual(1)
  }

  // The rebuild sits behind the same door.
  await change.getByRole('button', { name: 'Rebuild from today' }).click()
  await expect(change.getByRole('heading', { name: 'Rebuild from today' })).toBeVisible()

  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await change.screenshot({ path: info.outputPath(`change-my-plan-${scheme}-${size}.png`), animations: 'disabled' })
  }
})
