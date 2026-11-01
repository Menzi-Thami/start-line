import { test, expect } from '@playwright/test'

test('responsive account surface has no horizontal overflow and keeps controls accessible @phone', async ({ page }) => {
  for (const width of [320, 390, 768, 1024, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/account-responsive.html')
    await expect(page.locator('#layout-under-test')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1)
    const summary = page.locator('details > summary').first()
    await expect(summary).toBeVisible()
    await summary.click()
    await expect(summary.locator('..')).toHaveAttribute('open', '')
  }
})
