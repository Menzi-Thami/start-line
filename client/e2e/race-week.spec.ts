import { expect, test } from '@playwright/test'

test('race-week checklist persists on device, stays visible on race day, and fits phones @phone', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-11-08T08:00:00Z') })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/race-week.html')
  const summary = page.locator('.disclosure').getByText(/Race week/)
  await expect(summary).toContainText('race day')
  const checklist = page.locator('.race-week-checklist')
  await expect(checklist.locator('input[type=checkbox]')).toHaveCount(6)
  const first = checklist.locator('input[type=checkbox]').first()
  await first.check()
  await expect(summary).toContainText('1/6 ready')
  await page.reload()
  await expect(checklist.locator('input[type=checkbox]').first()).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('race-week-light.png'), fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.screenshot({ path: info.outputPath('race-week-dark.png'), fullPage: true })
})
