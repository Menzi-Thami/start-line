import { openDisclosure, openHomeMore } from './navigation'
import { screenshotPath } from './screenshots'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))
test.use({ baseURL: 'http://127.0.0.1:5176', colorScheme: 'dark' })

async function mockApi(page: Page, fail = false) {
  const state = { progressRequests: 0 }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/progress')) { state.progressRequests++; return route.fulfill({ json: [] }) }
    if ((fail && (path.endsWith('/coach') || path.endsWith('/running'))) || path.endsWith('/insights')) return route.fulfill({ status: 503, json: { title: 'Synthetic unavailable data', status: 503 } })
    const json = path.endsWith('/coach') ? { id: 'visibility-plan', plan, coaching: [] }
      : path.endsWith('/reminders') ? { available: false, devices: [], enabled: false }
        : path.endsWith('/strava') ? { available: true, connected: false, status: null, pending: 0, failed: 0 } : []
    return route.fulfill({ json })
  })
  return state
}

for (const width of [320, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
  test(`Home hierarchy and unobscured Builder navigation at ${width}px`, async ({ page }) => {
    const state = await mockApi(page)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/e2e/fixtures/redesign-screens.html?screen=home')
    const today = page.getByRole('region', { name: 'Today', exact: true })
    const week = page.getByRole('region', { name: 'This week', exact: true })
    const setup = page.getByRole('region', { name: /Get set up/ })
    await expect(today.getByRole('button', { name: "Open today's workout" })).toBeInViewport()
    await expect(setup).toBeVisible()
    const heroBox = (await today.boundingBox())!
    const weekBox = (await week.boundingBox())!
    expect((await setup.boundingBox())!.y).toBeGreaterThanOrEqual(heroBox.y + heroBox.height)
    if (width >= 768) { expect(weekBox.x).toBeGreaterThanOrEqual(heroBox.x + heroBox.width); expect(Math.abs(weekBox.y - heroBox.y)).toBeLessThan(2) }
    else expect(weekBox.y).toBeGreaterThanOrEqual(heroBox.y + heroBox.height)
    await expect(page.locator('.home-tiles')).toBeHidden()
    expect(state.progressRequests).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'refinements', `home-after-${width}.png`), fullPage: true })
    await openDisclosure(page, /^Running insights/)
    await expect(page.getByRole('heading', { name: 'Personal bests', exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Your progress', exact: true }).getByText('Your progress isn’t available right now.')).toBeVisible()
    expect(state.progressRequests).toBe(1)

    await page.goto('/e2e/fixtures/redesign-screens.html?screen=builder')
    const actions = page.getByRole('group', { name: 'Plan builder actions' })
    const pane = page.locator('.wizard-question')
    await expect(page.getByRole('button', { name: '5 Review' })).toHaveAttribute('aria-current', 'step')
    if (width < 768) {
      // Mobile builder uses natural page scrolling: the action row must follow
      // the complete question, not float ahead of options in a nested scroller.
      await expect(page.locator('.plan-builder-flow')).toHaveCSS('display', 'block')
      const box = (await pane.boundingBox())!
      expect((await actions.boundingBox())!.y).toBeGreaterThanOrEqual(box.y + box.height)
      const lastHint = page.getByText('Your plan also lives in its link, so you can share it with anyone.')
      await lastHint.scrollIntoViewIfNeeded()
      await expect(lastHint).toBeInViewport()
      await actions.scrollIntoViewIfNeeded()
      await expect(actions).toBeInViewport()
      await page.screenshot({ path: screenshotPath(test.info(), 'refinements', `builder-bottom-${width}.png`), fullPage: true })
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await page.screenshot({ path: screenshotPath(test.info(), 'refinements', `builder-after-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '2 Goal' }).click()
    await page.getByRole('group', { name: 'Goal finish time', exact: true }).getByLabel('Minutes', { exact: true }).fill('25')
    await page.getByRole('button', { name: '5 Review' }).click()
    await expect(page.locator('.review')).toContainText('25:30')
    expect(errors).toEqual([])
  })
}

test('review shortcuts preserve drafts and cannot submit an invalid goal', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/e2e/fixtures/redesign-screens.html?screen=builder')
  await page.getByRole('button', { name: '2 Goal' }).click()
  const goal = page.getByRole('group', { name: 'Goal finish time', exact: true })
  for (const label of ['Hours', 'Minutes', 'Seconds']) await goal.getByLabel(label, { exact: true }).fill('')
  await page.getByRole('button', { name: '5 Review' }).click()
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect(page.getByRole('button', { name: '2 Goal' })).toHaveAttribute('aria-current', 'step')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByTestId('builder-submission')).toHaveCount(0)
  await goal.getByLabel('Minutes', { exact: true }).fill('25')
  await page.getByRole('button', { name: '5 Review' }).click()
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
  await expect(page.getByTestId('builder-submission')).toBeVisible()
  expect(JSON.parse((await page.getByTestId('builder-submission').textContent())!)).toMatchObject({ goalSeconds: 1500, distanceKm: 5, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'] })
})

for (const mode of ['no-plan', 'race-week', 'expired', 'error', 'long-name']) {
  test(`Home ${mode} state retains usable actions at 320px`, async ({ page }) => {
    await mockApi(page, mode === 'error')
    await page.setViewportSize({ width: 320, height: 900 })
    await page.goto(`/e2e/fixtures/redesign-screens.html?screen=home&mode=${mode}`)
    if (mode === 'no-plan') await expect(page.getByRole('button', { name: 'Build my plan', exact: true })).toBeVisible()
    else if (mode === 'error') await expect(page.getByRole('button', { name: 'Retry plan' })).toBeVisible()
    else await expect(page.getByRole('button', { name: "Open today's workout" })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await openHomeMore(page)
    await expect(page.getByRole('button', { name: 'View all runs →' })).toBeVisible()
  })
}

for (const viewport of [{ width: 900, height: 430 }, { width: 375, height: 430 }]) {
  test(`Builder falls back to page scrolling in ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await mockApi(page)
    await page.setViewportSize(viewport)
    await page.goto('/e2e/fixtures/redesign-screens.html?screen=builder')
    await expect(page.locator('.plan-builder-flow')).not.toHaveAttribute('data-framed')
    await page.getByRole('button', { name: 'Build my plan', exact: true }).scrollIntoViewIfNeeded()
    await expect(page.getByRole('button', { name: 'Build my plan', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
}

test('a fresh Builder cannot skip unanswered steps and retains its draft after viewport changes', async ({ page }) => {
  await mockApi(page)
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/e2e/fixtures/redesign-screens.html?screen=builder&fresh=1')
  await expect(page.getByRole('button', { name: '2 Goal' })).toBeDisabled()
  await page.getByRole('radio', { name: /^Another race/ }).check()
  const name = page.getByRole('textbox', { name: 'Name (optional)', exact: true })
  await name.fill('A summer race')
  await page.setViewportSize({ width: 375, height: 430 })
  await expect(name).toHaveValue('A summer race')
  await expect(page.locator('.plan-builder-flow')).not.toHaveAttribute('data-framed')
  await page.setViewportSize({ width: 375, height: 812 })
  await expect(name).toHaveValue('A summer race')
  await page.getByRole('group', { name: 'Plan builder actions' }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('group', { name: 'Plan builder actions' })).toBeInViewport()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`Builder step text has accessible contrast in ${scheme} and works with 200% zoom`, async ({ page }) => {
    await mockApi(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('/e2e/fixtures/redesign-screens.html?screen=builder')
    const ratio = await page.getByRole('button', { name: '5 Review' }).locator('span').evaluate(element => {
      const style = getComputedStyle(element)
      const luminance = (color: string) => {
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722
      }
      const foreground = luminance(style.color), background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05)
    })
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.evaluate(() => { document.documentElement.style.zoom = '2' })
    await page.getByRole('button', { name: '2 Goal' }).click()
    await expect(page.getByRole('group', { name: 'Goal finish time', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
  })
}
