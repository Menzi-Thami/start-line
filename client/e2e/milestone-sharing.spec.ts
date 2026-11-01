import { expect, test } from '@playwright/test'

test('milestone card updates preview when name visibility changes @phone', async ({ page }, info) => {
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/milestone-preview.html')
  await expect(page.getByRole('heading', { name: 'Share a running milestone' })).toBeVisible()
  const preview = page.getByRole('img', { name: /Preview of/ })
  const download = page.getByRole('link', { name: 'Save PNG' })
  await expect(preview).toBeVisible()
  await expect(download).toHaveAttribute('download', 'taperday-longest.png')
  const first = await download.getAttribute('href')
  expect(first).toMatch(/^blob:/)

  await page.getByRole('checkbox', { name: 'Add my name to the image (optional)' }).check()
  await page.getByLabel('Name on card').fill('Example Runner')
  await expect(download).toHaveAttribute('href', /^blob:/)
  await expect.poll(() => download.getAttribute('href')).not.toBe(first)

  await page.getByLabel('Choose a milestone').selectOption('weekly-distance')
  await expect(download).toHaveAttribute('download', 'taperday-weekly-distance.png')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)

  await page.screenshot({ path: info.outputPath('milestone-preview.png'), fullPage: true })
})
