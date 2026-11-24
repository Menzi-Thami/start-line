import AxeBuilder from './axe'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { chapter, journeyOf, PLAN_ID, raceResult, recap } from '../src/features/journey/journey-fixtures'

const fixture = 'http://127.0.0.1:5176/e2e/fixtures/finish-line.html'
const shot = (name: string) => fileURLToPath(new URL(`../../docs/qa/2026-11-15/race-review/${name}.png`, import.meta.url))
const open = (page: Page, scene = 'hoka-recording', extra = '') => page.goto(`${fixture}?scene=${scene}&today=2026-11-15${extra}`)

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}

test('Hoka Half: automatic recording → one confirmation → review saved race → reload after expiry @phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page)
  await expect(page.getByText('2:06:15', { exact: true })).toBeVisible()
  await expect(page.getByText('20.3 km', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('test:hoka-journey')!).chapters[0].achievements)).toEqual([])
  await page.screenshot({ path: shot('recording-phone-light'), fullPage: true })
  await page.getByRole('button', { name: 'Confirm my recorded finish' }).dblclick()
  const film = page.getByRole('dialog', { name: 'RACE FINISHED.' })
  await expect(film.getByText('2:06:15', { exact: true })).toBeVisible()
  await film.getByRole('button', { name: 'Review my race' }).click()
  await expect(page.locator('.journey-race-summary')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
  await expect(page.getByText('20.3 km', { exact: true })).toBeVisible()
  await expect(page.getByText('Recording elapsed time', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share my race' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'I finished', exact: true })).toHaveCount(0)
  await expect(page.locator('.journey-training')).not.toHaveAttribute('open')
  await expect(page.locator('.recovery-offer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Explore recovery options', exact: true })).toBeVisible()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('test:hoka-journey')!))
  expect(saved.chapters[0].raceResult).toMatchObject({ finishTime: '02:06:15', distanceKm: 20.3, timeKind: 'RecordedElapsed', activityId: '33333333-3333-4333-8333-333333333333' })
  expect(saved.chapters[0].achievements.map((a: { kind: string }) => a.kind)).toEqual(['RaceFinished'])
  await accessible(page)
  await page.screenshot({ path: shot('saved-phone-light'), fullPage: true })
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await accessible(page)
  await page.screenshot({ path: shot('saved-phone-dark'), fullPage: true })
  await open(page, 'hoka-recording', '&cache=expired')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.getByText('Race details & corrections', { exact: true }).click()
  await page.getByRole('button', { name: 'Edit result' }).click()
  await expect(page.getByRole('textbox', { name: 'Hours' })).toHaveValue('2')
  await expect(page.getByRole('textbox', { name: 'Minutes' })).toHaveValue('6')
  await expect(page.getByRole('textbox', { name: 'Seconds' })).toHaveValue('15')
  await expect(page.getByLabel('Distance (km)', { exact: true })).toHaveValue('20.3')
})

test('a result arriving over an empty draft opens the actual saved race from the celebration @phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await open(page, 'hoka-recording', '&cache=expired')
  await page.getByRole('button', { name: 'I finished', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Hours' })).toHaveValue('')
  await page.evaluate(() => window.dispatchEvent(new Event('test:race-arrived')))
  await page.getByRole('dialog').getByRole('button', { name: 'Review my race' }).click()
  await expect(page.locator('.journey-race-summary')).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'I finished', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('race review is calm, responsive and accessible in both themes', async ({ page }) => {
  for (const width of [320, 375, 820, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const mode of ['light', 'dark']) {
      await open(page, 'hoka-finished', '&cache=expired')
      await page.evaluate(mode => { document.documentElement.dataset.theme = mode }, mode)
      await expect(page.getByRole('button', { name: 'Share my race' })).toBeVisible()
      await expect(page.locator('.training-story')).toBeHidden()
      await expect(page.locator('.recovery-offer')).toBeHidden()
      await accessible(page)
      if (width === 1440) await page.screenshot({ path: shot(`saved-desktop-${mode}`), fullPage: true })
      await page.getByRole('button', { name: 'Explore recovery options', exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Your recovery plan.', exact: true })).toBeVisible()
      await expect(page.locator('.training-story')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Start my recovery' })).toBeVisible()
      const effort = page.getByRole('radio', { name: /All out/, includeHidden: true })
      await expect(effort).toBeHidden()
      await page.getByText('Adjust recovery preferences', { exact: true }).click()
      await expect(effort).toBeVisible()
      await accessible(page)
      await effort.check()
      await page.getByText('Adjust recovery preferences', { exact: true }).click()
      await expect(effort).toBeHidden()
      await page.getByText('Adjust recovery preferences', { exact: true }).click()
      await expect(effort).toBeChecked()
    }
  }
})

test('saved race exports actual metrics to a portrait PNG and an escaped SVG fallback', async ({ page }) => {
  await open(page, 'hoka-finished', '&cache=expired')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save race card' }).click()
  const file = await download
  expect(file.suggestedFilename()).toBe('taperday-race-finish.png')
  const png = await readFile((await file.path())!)
  expect(png.subarray(1, 4).toString()).toBe('PNG')
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920])
  await file.saveAs(shot('race-card'))
  await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null })
  const fallback = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save race card' }).click()
  const svg = await fallback
  expect(svg.suggestedFilename()).toBe('taperday-race-finish.svg')
  const xml = await readFile((await svg.path())!, 'utf8')
  expect(xml).toContain('2:06:15')
  expect(xml).toContain('20.3 km')
  expect(xml).toContain('RECORDING ELAPSED')
  expect(xml).not.toContain('21.1 km')
  expect(xml).not.toContain('test-token')
})

test('native race sharing starts in the tap and includes the prepared image', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      if (!navigator.userActivation.isActive) throw new Error('Share lost its tap')
      const file = data.files![0]!
      const bitmap = await createImageBitmap(file)
      Object.assign(window, { sharedRace: { text: data.text, name: file.name, width: bitmap.width, height: bitmap.height } })
      bitmap.close()
    } })
  })
  await open(page, 'hoka-finished', '&cache=expired')
  await page.getByRole('button', { name: 'Share my race' }).click()
  await expect(page.getByRole('status')).toHaveText('Shared.')
  expect(await page.evaluate(() => Reflect.get(window, 'sharedRace'))).toEqual({ text: 'I finished Hoka Half in 2:06:15 (recording elapsed time)! #Taperday', name: 'taperday-race-finish.png', width: 1080, height: 1920 })
})

test('the actual app offers recovery on Home and retains the saved race in Journey after reload @phone', async ({ page }) => {
  const result = raceResult({ raceDate: '2026-11-14', finishTime: '02:06:15', distanceKm: 20.3, timeKind: 'RecordedElapsed', activityId: 'expired-recording' })
  const saved = chapter({ raceName: 'Hoka Half', raceDate: result.raceDate, status: 'Concluded', lifecycle: 'Concluded', raceResult: result,
    training: recap({ scheduledRuns: 10, confirmedRuns: 4, allConfirmed: false, raceDatePassed: true }),
    achievements: [{ id: 'race-award', kind: 'RaceFinished', planId: PLAN_ID, earnedOn: result.raceDate, awardedAt: '2026-11-15T08:00:00Z', celebratedAt: '2026-11-15T08:01:00Z' }] })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'synthetic-journey-runner', displayName: 'QA runner', email: 'journey@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21' }
    else if (path === '/api/v1/me/plans') data = [{ id: PLAN_ID, raceName: 'Hoka Half', raceDate: result.raceDate, status: 'Concluded' }]
    else if (path === '/api/v1/me/journey') data = journeyOf([saved])
    else if (path === `/api/v1/me/journey/plans/${PLAN_ID}`) data = saved
    else if (path === '/api/v1/me/journey/races') data = { races: [], majors: [] }
    else if (path.endsWith('/strava')) data = { available: true, connected: true, syncedRuns: 0, pending: 0, failed: 0 }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/photo')) { await route.fulfill({ status: 204 }); return }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date('2026-11-15T08:00:00Z') })
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/journey.html?view=home')
  await expect(page.getByText('Training concluded', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Explore recovery options', exact: true })).toBeVisible()
  await expect(page.locator('.journey-home button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Review my race', exact: true })).toHaveCount(0)
  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Journey', exact: true }).click()
  await page.getByRole('button', { name: 'View chapter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Your plan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit plan', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'I finished', exact: true })).toHaveCount(0)
  await accessible(page)
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); scrollTo(0, 0) })
  await page.screenshot({ path: shot('app-saved-phone-light'), fullPage: true })
  await page.reload()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'View chapter', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Finished in 2:06:15' })).toBeVisible()
})
