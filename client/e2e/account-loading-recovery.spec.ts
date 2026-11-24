import AxeBuilder from './axe'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page, type Route } from '@playwright/test'
import { ownerOf } from '../src/lib/home-snapshot'
import { chapter, journeyOf, recap } from '../src/features/journey/journey-fixtures'

test.use({ serviceWorkers: 'block' })

async function connection(page: Page) {
  const account = { name: 'Journey QA', email: 'journey@example.test' }
  const runner = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: account.email, timeZone: 'UTC', units: 'Kilometres',
    weeklyEmails: false, consentedAt: '2026-11-16T12:00:00Z', maxHeartRate: null, privacyNoticeVersion: '2026-10-21',
    needsPrivacyConsent: false, heartRateConsent: false, updateEmails: false, updateEmailsOffAt: null }
  await page.clock.install({ time: new Date('2026-11-16T12:00:00Z') })
  await page.addInitScript(({ owner, runner }) => {
    localStorage.setItem('startline:home', JSON.stringify({ v: 1, owner,
      snapshot: { savedAt: '2026-11-16T12:00:00Z', runner, current: null } }))
  }, { owner: ownerOf(account), runner })
  let recover = false
  const held: Route[] = []
  let accountReads = 0
  await page.route('**/health/**', route => route.fulfill({ body: 'Healthy' }))
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') {
      accountReads++
      if (!recover) { held.push(route); return }
      data = { ...runner, displayName: 'Naledi online' }
    } else if (path === '/api/v1/me/journey') {
      data = journeyOf([chapter({ raceName: 'Hoka Half', raceDate: '2026-11-14', status: 'Concluded', lifecycle: 'Concluded',
        training: recap({ raceDatePassed: true, allConfirmed: false }), achievements: [] })])
    } else if (path === '/api/v1/me/journey/races') data = { races: [], majors: [] }
    else if (path.endsWith('/strava')) data = { available: false, connected: false }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo') || path.endsWith('/beginner')) { await route.fulfill({ status: 204 }); return }
    await route.fulfill({ json: data })
  })
  return { held, reads: () => accountReads, recover: () => { recover = true } }
}

test('cached Home → slow account → deadline → retry restores the saved chapter and navigation @phone', async ({ page }, info) => {
  const state = await connection(page)
  const held = state.held
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi', exact: true })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(nav).toBeVisible()
  await expect.poll(() => held.length).toBe(1)
  await page.clock.runFor(6500)
  await expect(page.locator('.sign-in-wait').getByRole('button', { name: 'Try again', exact: true })).toBeVisible()
  await expect(page.locator('.account-warmup .runner-sprint')).toBeVisible()
  await expect(page.getByText('Finding your current chapter…', { exact: true })).toHaveCount(0)
  await page.clock.runFor(60_000)
  await expect(page.getByRole('alert')).toContainText('Your account is taking too long to load. Please try again.')
  await expect(page.getByText('Fetch is aborted', { exact: true })).toHaveCount(0)
  await expect(nav).toBeVisible()
  await expect(page.getByText('Something to run towards?', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('connection-run-timeout.png'), fullPage: true })
  for (const route of held) await route.abort().catch(() => undefined) // The browser may already have cancelled it.
  state.recover()
  await page.getByRole('button', { name: 'Try again', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Welcome back, Naledi online', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review my race', exact: true })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.home-top')).toHaveCount(0)
  await expect(nav).toBeVisible()
  expect(state.reads()).toBe(2)
  await page.screenshot({ path: info.outputPath('connection-run-recovered.png'), fullPage: true })
  await nav.getByRole('button', { name: 'Journey', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your journey.', exact: true })).toBeVisible()
})

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`slow connection shows the runner, a plain status and immediate recovery with ${motion} motion @phone`, async ({ page }, info) => {
    const state = await connection(page)
    await page.emulateMedia({ reducedMotion: motion })
    await page.setViewportSize({ width: 375, height: 900 })
    await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
    const greeting = page.getByRole('heading', { name: 'Welcome back, Naledi', exact: true })
    const nav = page.getByRole('navigation', { name: 'Main', exact: true })
    await expect(greeting).toBeVisible()
    await expect(page.locator('.account-warmup')).toHaveCount(0)
    await expect.poll(() => state.held.length).toBe(1)
    await page.clock.runFor(6500)
    const warm = page.getByRole('region', { name: 'Connecting to Taperday', exact: true })
    await expect(warm).toBeVisible()
    await expect(warm).toContainText('Your saved Home stays below')
    await expect(page.getByText('Finding your current chapter…', { exact: true })).toHaveCount(0)
    await expect(greeting).toBeVisible()
    await expect(nav).toBeVisible()
    expect(await warm.locator('.limb').count()).toBeGreaterThan(0)
    const animationStates = () => warm.locator('.limb').evaluateAll(limbs => limbs.map(limb => ({ name: getComputedStyle(limb).animationName, count: getComputedStyle(limb).animationIterationCount })))
    // The runner moves for a few seconds and then rests: finite, so there is nothing to pause (WCAG 2.2.2).
    if (motion === 'no-preference') expect((await animationStates()).every(value => value.name !== 'none' && value.count !== 'infinite')).toBe(true)
    else expect((await animationStates()).every(value => value.name === 'none')).toBe(true)
    await expect(warm.getByRole('button')).toHaveText(['Try again', 'Sign out'])
    await expect(warm).not.toContainText('While you wait')
    // Let the finite motion end so the screenshots below are stable; finish() throws on an infinite animation.
    await warm.evaluate(node => node.getAnimations({ subtree: true }).forEach(animation => animation.finish()))
    for (const width of [320, 375, 820, 1440]) for (const mode of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 })
      await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
      await page.evaluate(async () => {
        await document.fonts.ready
        await new Promise(requestAnimationFrame)
        // Theme transitions must settle before measuring contrast; the runner stays controlled separately.
        await Promise.all(document.getAnimations().filter(animation => animation instanceof CSSTransition).map(animation => animation.finished.catch(() => undefined)))
      })
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      if (info.project.name === 'desktop' && [375, 1440].includes(width)) {
        const qa = fileURLToPath(new URL('../../docs/qa/2026-11-17/account-warmup/', import.meta.url))
        await mkdir(qa, { recursive: true })
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
        await page.screenshot({ path: `${qa}/warmup-${width}-${mode}-${motion}.png`, fullPage: true })
      }
    }
    state.recover()
    for (const route of state.held) await route.fulfill({ json: { id: 'synthetic-journey-runner', displayName: 'Naledi online', units: 'Kilometres', timeZone: 'UTC', needsPrivacyConsent: false } }).catch(() => undefined)
    await expect(warm).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Welcome back, Naledi online', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review my race', exact: true })).toBeVisible()
    expect(state.reads()).toBe(1)
  })
}
