import { expect, test } from '@playwright/test'

/**
 * Visual acceptance for the cross-screen AI Studio-inspired polish.
 * Keep the original running animation, Frame/Night Run themes, and existing navigation.
 * Every screen must remain usable on small phones, tablets and desktop.
 */
test.use({ baseURL: 'http://127.0.0.1:5176' })

const screens = ['home', 'builder', 'runs', 'account'] as const

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`studio-inspired responsive surfaces — ${scheme} ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))

      for (const view of screens) {
        await page.goto(`/e2e/fixtures/redesign-screens.html?screen=${view}`)
        await expect(page.getByRole('heading').first()).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        expect(overflow, `${view} at ${width}px (${scheme}) should not overflow horizontally`).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: testInfo.outputPath(`studio-run-${scheme}-${width}-${view}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }

      for (const view of ['plan', 'progress'] as const) {
        await page.goto('/e2e/fixtures/redesign.html?progress=1')
        await expect(page.getByRole('tab', { name: 'This week', exact: true })).toBeVisible()
        if (view === 'progress') {
          await page.getByRole('tab', { name: 'Progress', exact: true }).click()
          await expect(page.getByRole('region', { name: 'Training progress' })).toBeVisible()
        }
        await page.evaluate(() => document.fonts.ready)
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        expect(overflow, `${view} at ${width}px (${scheme}) should not overflow horizontally`).toBeLessThanOrEqual(1)
        await page.screenshot({
          path: testInfo.outputPath(`run-studio-${scheme}-${width}-${view}.png`),
          fullPage: true,
          animations: 'disabled',
        })
      }

      expect(errors, `Uncaught page errors at ${width}px in ${scheme}`).toEqual([])
    })
  }
}
