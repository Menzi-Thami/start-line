import { expect, test } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:5176' })

for (const scheme of ['dark', 'light'] as const) {
  for (const width of [375, 1440]) {
    test(`post-run analysis visual acceptance in ${scheme} at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/e2e/fixtures/redesign.html?stages=1')
      await page.getByRole('button', { name: /^Tuesday 13 October 2026:/ }).click()
      await page.getByRole('button', { name: /Open day details/ }).click()
      await page.getByRole('button', { name: 'View run analysis', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Long run', level: 2 })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Run summary' })).toContainText('15.4 km')
      await expect(page.locator('.ra-hero .runner-sprint')).toBeVisible()
      // One scroll, no tabs: the plan comparison appears once, then splits, pace, stages, bests, shoe, sharing and delete.
      await expect(page.getByRole('tab')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Plan vs actual' })).toHaveCount(1)
      for (const name of ['Your pace splits', 'Best efforts']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
      await expect(page.getByText('Detailed zone and split evidence')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `overflow in ${scheme} at ${width}px`).toBeLessThanOrEqual(1)
      await page.screenshot({ path: testInfo.outputPath(`analysis-run-${scheme}-${width}.png`), fullPage: true, animations: 'disabled' })
      expect(errors).toEqual([])
    })
  }
}
