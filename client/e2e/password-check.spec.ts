import { test, expect } from '@playwright/test'
import Axe from './axe'

const fixture = 'http://127.0.0.1:5176/e2e/fixtures/password-check.html'

for (const theme of ['light', 'dark']) for (const width of [375, 1440]) {
  test(`password check stays read-only at ${width}px ${theme} @phone`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(value => localStorage.setItem('taperday:theme', value), theme)
    const calls: string[] = []
    await page.route('**/api/v1/**', route => {
      calls.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`)
      return route.fulfill({ json: { id: 'synthetic-existing-runner', displayName: 'QA' } })
    })
    await page.goto(fixture)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.getByRole('heading', { name: 'Password sign-in check' })).toBeVisible()
    expect(calls).toEqual([])
    await page.getByRole('button', { name: 'Check account access' }).click()
    await expect(page.getByText('Runner ID: synthetic-existing-runner')).toBeVisible()
    expect(calls).toEqual(['GET /api/v1/me'])
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await expect(page.getByText(/does not convert accounts or confirm that a password was used/)).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: info.outputPath(`password-check-${theme}-${width}.png`), fullPage: true })
    const audit = await new Axe({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(audit.violations).toEqual([])
  })
}

test('unconfigured built entry is disabled and never starts an account request @phone', async ({ page }) => {
  const calls: string[] = []
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(request.url()) })
  await page.goto('/password-check.html')
  await expect(page.getByRole('heading', { name: 'Password sign-in check' })).toBeVisible()
  await expect(page.getByText('Password checks are not enabled on this site yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create a test account' })).toHaveCount(0)
  expect(calls).toEqual([])
})
