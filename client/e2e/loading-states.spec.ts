import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mockApi, out } from './perf-api'

// Loading states beyond the happy path: wide and tablet widths, Slow 3G, an app sent to the background mid-wait, and
// Back or a quick tab change while a request is still out. Synthetic account and data; Playwright emulation only.
test.use({ serviceWorkers: 'block' })
const fixture = 'http://127.0.0.1:5176/e2e/fixtures/journey.html'

const setTheme = (page: Page, mode: string) => page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
const hide = (page: Page, hidden: boolean) => page.evaluate(value => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') })
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
  document.dispatchEvent(new Event('visibilitychange'))
}, hidden)

for (const width of [768, 1024, 2560]) {
  test(`Runs wait at ${width}px holds its place, keeps navigation and fits the screen in both themes`, async ({ page }, info) => {
    const api = await mockApi(page, { hold: path => path === '/api/v1/me/activities' })
    await page.setViewportSize({ width, height: width > 1440 ? 1440 : 1024 })
    await page.goto(`${fixture}?view=runs`)
    const wait = page.getByRole('status', { name: 'Loading your runs…', exact: true })
    await expect(wait).toBeVisible()
    await expect.poll(() => wait.evaluate(node => getComputedStyle(node.closest('.runner-loading')!).opacity)).toBe('1')
    const nav = page.getByRole('navigation', { name: 'Main', exact: true })
    await expect(nav).toBeVisible()
    for (const mode of ['light', 'dark']) {
      await setTheme(page, mode)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      const box = await page.locator('.runner-loading').boundingBox()
      expect(box!.width).toBeLessThanOrEqual(560 + 1)
      await mkdir(out, { recursive: true })
      if (!info.project.name.includes('phone')) await page.screenshot({ path: join(out, `runs-wait-${width}-${mode}-${info.project.name}.png`) })
    }
    // Navigation still works while the list is out: Home opens straight away.
    await nav.getByRole('button', { name: 'Home', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
    await expect(wait).toHaveCount(0)
    for (const call of api.held) call.release()
  })
}

test('Slow 3G: the boot screen covers the first load, the app arrives, and the numbers are recorded', async ({ page, browserName }, info) => {
  test.skip(browserName !== 'chromium', 'Network throttling uses the Chrome DevTools Protocol, which only Chromium has.')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  // DevTools' Slow 3G preset: 400 ms extra latency, about 400 kbit/s down and up.
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 })
  let bytes = 0
  let requests = 0
  page.on('response', response => { requests++; void response.body().then(body => { bytes += body.length }).catch(() => undefined) })
  const started = Date.now()
  await page.goto('/', { waitUntil: 'commit' })
  // The static boot screen is in the HTML itself, so something branded shows before any script arrives.
  await expect(page.locator('.boot-screen')).toBeVisible()
  const bootMs = Date.now() - started
  await expect(page.locator('.boot-screen')).toHaveCount(0, { timeout: 90_000 })
  await expect(page.locator('main#main-content')).toBeVisible({ timeout: 30_000 })
  const appMs = Date.now() - started
  await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => undefined)
  const idleMs = Date.now() - started
  await mkdir(out, { recursive: true })
  await page.screenshot({ path: join(out, `slow-3g-ready-${info.project.name}.png`) })
  const result = { profile: 'Slow 3G (400 ms, 50 kB/s)', bootScreenMs: bootMs, appShownMs: appMs, networkIdleMs: idleMs, requests, kilobytes: Math.round(bytes / 1024) }
  await writeFile(join(out, `slow-3g-${info.project.name}.json`), JSON.stringify(result, null, 2))
  console.log(`[loading-performance] slow-3g-${info.project.name} ${JSON.stringify(result)}`)
  expect(appMs).toBeLessThan(90_000)
})

test('A slow account wait stops its health checks while the app is in the background and picks up on return', async ({ page }) => {
  const api = await mockApi(page, { hold: path => path === '/api/v1/me', healthDown: true })
  await page.goto(`${fixture}?view=home`)
  await expect.poll(() => api.held.length).toBe(1)
  await page.clock.runFor(6_500)
  const warm = page.getByRole('region', { name: 'Connecting to Taperday', exact: true })
  await expect(warm).toBeVisible()
  await page.clock.runFor(7_000)
  await expect.poll(() => api.health()).toBeGreaterThan(0)
  await hide(page, true)
  // Let any check already on its way finish, then nothing more while hidden.
  await page.clock.runFor(3_500)
  const hidden = api.health()
  // 30 s hidden, inside the account read's 60 s timeout, which the page clock also counts.
  await page.clock.runFor(30_000)
  expect(api.health()).toBe(hidden)
  await hide(page, false)
  await page.clock.runFor(3_500)
  await expect.poll(() => api.health()).toBeGreaterThan(hidden)
  await expect(warm.getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  for (const call of api.held) call.release()
})

test('Back while a run is still loading returns to the list, and the late answer does not take over @phone', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const api = await mockApi(page, { hold: path => path.startsWith('/api/v1/me/activities/{run}') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${fixture}?view=runs`)
  await page.getByRole('button', { name: /Run analysis/ }).first().click()
  const wait = page.getByRole('status', { name: 'Loading your run…', exact: true })
  await expect(wait).toBeVisible()
  // Back is offered on the wait itself, and the browser's Back works too.
  await expect(page.locator('section[aria-busy="true"]').getByRole('button').first()).toBeVisible()
  await page.goBack()
  await expect(wait).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Run analysis/ }).first()).toBeVisible()
  await expect.poll(() => api.held.length).toBeGreaterThan(0)
  for (const call of api.held) call.release()
  await api.settle()
  await expect(page.getByRole('heading', { name: /Run analysis ·/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Run analysis/ }).first()).toBeVisible()
  // Forward reopens it and asks again.
  const asked = api.held.length
  await page.goForward()
  await expect(wait).toBeVisible()
  await expect.poll(() => api.held.length).toBeGreaterThan(asked)
  for (const call of api.held) call.release()
  expect(errors).toEqual([])
})

test('Quick tab changes while requests are out end on the last tab with no loader left behind', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const api = await mockApi(page, { latencyMs: 1_200 })
  await page.goto(`${fixture}?view=home`)
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(nav).toBeVisible()
  for (const tab of ['Runs', 'Journey', 'Plan', 'Account', 'Runs', 'Home']) await nav.getByRole('button', { name: tab, exact: true }).click()
  await expect(page.getByRole('region', { name: 'Today', exact: true })).toBeVisible()
  await api.settle()
  await expect(page.locator('.runner-loading, .account-warmup')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Today', exact: true }).getByRole('status')).toHaveCount(0)
  await expect(nav.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
  expect(errors).toEqual([])
})
