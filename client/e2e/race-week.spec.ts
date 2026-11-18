import { expect, test } from '@playwright/test'

test('race prep shows only in race week, keeps its checklist on the device and fits phones @phone', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/race-week.html?today=2026-10-30')
  await expect(page.locator('#race-prep')).toHaveCount(0)

  await page.goto('http://127.0.0.1:5176/e2e/fixtures/race-week.html?today=2026-11-05')
  const card = page.locator('#race-prep')
  await expect(card.getByRole('heading', { name: 'Prepare for Parkrun PB' })).toBeVisible()
  await expect(card).toContainText('Race week · 3 days to go')
  await expect(card.getByRole('table')).toContainText('24:30')

  await page.goto('http://127.0.0.1:5176/e2e/fixtures/race-week.html?today=2026-11-08')
  await expect(card.getByRole('heading', { name: 'It’s race day.' })).toBeVisible()
  const checklist = card.locator('.race-week-checklist')
  await expect(checklist.locator('input[type=checkbox]')).toHaveCount(6)
  await checklist.locator('input[type=checkbox]').first().check()
  await expect(card).toContainText('1 of 6 ready')
  await page.reload()
  await expect(checklist.locator('input[type=checkbox]').first()).toBeChecked()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: info.outputPath('race-prep-light.png'), fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await page.screenshot({ path: info.outputPath('race-prep-dark.png'), fullPage: true })
})
