import { expect, test } from '@playwright/test'

test('Couch to 5K week, calendar and progress work on every screen @phone', async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/beginner-journey.html')
    await expect(page.getByRole('heading', { name: 'Couch to 5K' })).toBeVisible()
    await expect(page.getByRole('checkbox')).toHaveCount(3)
    await page.getByRole('button', { name: 'Calendar' }).click()
    await expect(page.getByRole('region', { name: 'Couch to 5K calendar' })).toBeVisible()
    await page.getByRole('button', { name: /Week 2, from/i }).click()
    await expect(page.getByText('Week 2 of 9')).toBeVisible()
    await page.getByRole('button', { name: 'Progress' }).click()
    await expect(page.getByRole('region', { name: 'Couch to 5K progress' })).toBeVisible()
    await expect(page.getByRole('img', { name: /Week 2: 0 confirmed/ })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1)
    if ([320, 390, 768, 1440].includes(width)) {
      await test.info().attach(`beginner-progress-${width}.png`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
    }
  }
})
