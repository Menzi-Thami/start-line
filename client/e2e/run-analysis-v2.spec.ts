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
      await expect(page.getByRole('heading', { name: 'Plan vs actual' })).toBeVisible()
      for (const tab of ['Overview', 'Splits', 'Charts', 'Details'] as const) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await expect(page.getByRole('tabpanel', { name: tab })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${tab} overflow in ${scheme} at ${width}px`).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: testInfo.outputPath(`run-analysis-${scheme}-${width}-${tab.toLowerCase()}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }
      expect(errors).toEqual([])
    })
  }
}
