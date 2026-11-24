import { expect, test } from '@playwright/test'
import AxeBuilder from './axe'

const fixture = `${process.env.AUTH_QA_ORIGIN ?? 'http://127.0.0.1:5176'}/e2e/fixtures/auth-gate.html`
test.use({ serviceWorkers: 'block' })

test('signed-out deep links and remembered accounts never flash private training @phone', async ({ page }, info) => {
  for (const session of ['signed-out', 'expired']) {
    await page.goto(`${fixture}?session=${session}&view=runs&run=synthetic-run`)
    await expect(page.getByRole('heading', { name: session === 'signed-out' ? 'Your next run starts here.' : 'Continue securely.' })).toBeVisible()
    await expect(page.getByText('Private training fixture', { exact: true })).toHaveCount(0)
    for (const width of [320, 390, 768, 1440]) for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode }, theme)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      await page.screenshot({ path: info.outputPath(`${session}-account-${width}-${theme}.png`), fullPage: true })
    }
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()
    expect(audit.violations).toEqual([])
  }
})

test('revoking a verified synthetic session immediately unmounts private training @phone', async ({ page }) => {
  await page.goto(`${fixture}?session=verified&view=plan`)
  await expect(page.getByRole('heading', { name: 'Private training fixture' })).toBeVisible()
  await page.evaluate(() => dispatchEvent(new CustomEvent('qa:session', { detail: 'expired' })))
  await expect(page.getByRole('heading', { name: 'Continue securely.' })).toBeVisible()
  await expect(page.getByText('Private training fixture', { exact: true })).toHaveCount(0)
})

test('slow initialization offers recovery while training stays closed @phone', async ({ page }) => {
  await page.clock.install()
  await page.goto(`${fixture}?session=loading`)
  await page.clock.runFor(12_500)
  await expect(page.getByRole('button', { name: 'Reload Taperday' })).toBeVisible()
  await expect(page.getByText('Private training fixture', { exact: true })).toHaveCount(0)
})

test('privacy remains public even with an expired synthetic session @phone', async ({ page }) => {
  await page.goto(`${fixture}?session=expired&view=privacy`)
  await expect(page.getByRole('heading', { name: /Privacy/i }).first()).toBeVisible()
  await expect(page.getByText('Private training fixture', { exact: true })).toHaveCount(0)
})
