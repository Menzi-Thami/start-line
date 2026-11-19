import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { chapter, journeyOf, PLAN_ID, raceResult, recovery } from '../src/features/journey/journey-fixtures'
import { majorDefinitions, raceMemory } from '../src/features/journey/race-history-fixtures'
import type { RaceMemory, SaveRaceMemory } from '../src/features/journey/types'

const FIXTURE = 'http://127.0.0.1:5176/e2e/fixtures/journey.html'
const seedMemories = () => [raceMemory(), raceMemory({ eventName: 'Berlin Marathon', major: 'Berlin', result: raceResult({ id: 'bbbbbbbb-0000-4000-8000-000000000002', planId: null, raceDate: '2026-09-27', finishTime: '03:56:12', distanceKm: 42.3, timeKind: 'OfficialChip' }) }),
  raceMemory({ eventName: 'My first half', eventDistanceKm: 21.1, major: null, majorEligible: false, result: raceResult({ id: 'cccccccc-0000-4000-8000-000000000003', planId: null, raceDate: '2025-10-12', finishTime: '01:54:10', timeKind: 'RecordedElapsed' }) })].sort((a, b) => b.result.raceDate.localeCompare(a.result.raceDate))

async function fixture(page: Page, options: { races?: RaceMemory[]; current?: boolean; failSave?: boolean; recording?: boolean } = {}) {
  const state = { races: options.races ?? [], current: !!options.current, failSave: !!options.failSave, writes: [] as { id: string; body: SaveRaceMemory }[], revision: 1 }
  const linked = raceResult({ id: 'dddddddd-0000-4000-8000-000000000004', raceDate: '2026-11-15', distanceKm: 10, finishTime: '00:53:24' })
  const training = chapter({ raceName: 'Spring 10K', raceDate: '2026-11-15', distanceKm: 10, raceResult: linked, version: 'plan-v1', lifecycle: 'Recovering' })
  const recording = { id: 'eeeeeeee-0000-4000-8000-000000000005', localDate: '2026-04-26', startedAt: '2026-04-26T08:00:00Z', kind: 'Run', distanceKm: 42.4,
    movingSeconds: 14000, paceSecondsPerKm: 330, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null,
    source: { kind: 'Strava', viewUrl: null, recordedOnGarmin: false, cachedUntil: null } }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path === '/api/v1/me') data = { id: 'synthetic-journey-runner', displayName: 'Naledi', email: 'journey@example.test', timeZone: 'Africa/Johannesburg', units: 'Kilometres', needsPrivacyConsent: false, privacyNoticeVersion: '2026-10-21' }
    else if (path === '/api/v1/me/activities') data = options.recording ? [recording] : []
    else if (path === `/api/v1/me/activities/${recording.id}`) data = { ...recording, elapsedSeconds: 14612 }
    else if (path === '/api/v1/me/plans') data = options.current ? [{ id: PLAN_ID, name: 'Spring 10K', raceName: 'Spring 10K', raceDate: '2026-11-15', status: state.current ? 'Active' : 'Archived', createdAt: '2026-08-24T10:00:00Z' }] : []
    else if (path === '/api/v1/me/journey') data = journeyOf(options.current ? [{ ...training, status: state.current ? 'Active' : 'Archived' }] : [], { recovery: options.current ? recovery({ raceDate: '2026-11-15', distanceKm: 10, eventName: 'Spring 10K' }) : null })
    else if (path === `/api/v1/me/journey/plans/${PLAN_ID}/archive`) { expect(request.postDataJSON()).toEqual({ expectedVersion: 'plan-v1' }); state.current = false; await route.fulfill({ status: 204 }); return }
    else if (path === '/api/v1/me/journey/races') data = { races: state.races, majors: majorDefinitions }
    else if (path.includes('/api/v1/me/journey/races/') && request.method() === 'PUT') {
      const body = request.postDataJSON() as SaveRaceMemory
      const id = path.split('/').at(-1)!
      state.writes.push({ id, body })
      if (state.failSave) { state.failSave = false; await route.fulfill({ status: 503, json: { detail: 'Synthetic temporary failure' } }); return }
      const existing = state.races.find(memory => memory.result.id === id)
      if (existing && body.expectedVersion !== existing.result.version) { await route.fulfill({ status: 409, json: { detail: 'Your result changed. Reload it before saving.' } }); return }
      const major = body.major ?? majorDefinitions.find(definition => definition.name === body.eventName)?.id ?? null
      const definition = majorDefinitions.find(value => value.id === major)
      const memory: RaceMemory = { eventName: body.eventName, eventDistanceKm: body.eventDistanceKm, major, needsReview: false,
        majorEligible: body.outcome === 'Finished' && major !== null && (!definition?.firstQualifyingYear || Number(body.raceDate.slice(0, 4)) >= definition.firstQualifyingYear),
        result: raceResult({ id, planId: null, outcome: body.outcome, raceDate: body.raceDate, finishTime: body.finishTime ?? null, distanceKm: body.distanceKm ?? null,
          activityId: body.activityId ?? null, note: body.note ?? null, timeKind: body.finishTime ? body.timeKind ?? 'Unspecified' : 'Unspecified', version: `race-v${++state.revision}` }) }
      state.races = [memory, ...state.races.filter(race => race.result.id !== id)]
      data = memory
    } else if (path.includes('/api/v1/me/journey/races/') && request.method() === 'DELETE') {
      const id = path.split('/').at(-1)
      const existing = state.races.find(memory => memory.result.id === id)
      expect(new URL(request.url()).searchParams.get('expectedVersion')).toBe(existing?.result.version)
      state.races = state.races.filter(memory => memory.result.id !== id)
      await route.fulfill({ status: 204 }); return
    } else if (path.endsWith('/photo')) { await route.fulfill({ status: 204 }); return }
    else if (path.endsWith('/reminders')) data = { available: false }
    else if (path.endsWith('/strava')) data = { available: false, connected: false, syncedRuns: 0, pending: 0, failed: 0 }
    await route.fulfill({ json: data })
  })
  await page.clock.install({ time: new Date('2026-11-15T08:00:00Z') })
  return state
}

test('Journey remains reachable after archiving the last plan, with its result and recovery intact @phone', async ({ page }, info) => {
  const state = await fixture(page, { current: true })
  await page.goto(`${FIXTURE}?view=journey`)
  await expect(page.getByRole('heading', { name: 'Your journey.', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Your recovery', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Archive training plan', exact: true }).click()
  await expect(page.getByText(/Recovery continues/)).toBeVisible()
  await page.getByRole('button', { name: 'Keep chapter and archive', exact: true }).click()
  const navigation = page.getByRole('navigation', { name: 'Main', exact: true })
  await expect(navigation.getByRole('button')).toHaveCount(5)
  for (const [index, name] of ['Home', 'Plan', 'Runs', 'Journey', 'Account'].entries()) await expect(navigation.getByRole('button').nth(index)).toHaveAccessibleName(name)
  await expect(page.getByText(/Past plan/)).toBeVisible()
  await expect(page.locator('.journey-chapter-facts')).toContainText('Finished in 53:24')
  expect(state.current).toBe(false)
  await page.reload()
  await expect(page.getByRole('region', { name: 'Your recovery', exact: true })).toBeVisible()
  await expect(navigation.getByRole('button', { name: 'Journey', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.screenshot({ path: info.outputPath('archived-with-recovery.png'), fullPage: true })
})

test('past race save → failed retry → reload → correction → trophy withdrawal follows the real screens @phone', async ({ page }) => {
  const state = await fixture(page, { failSave: true })
  await page.goto(`${FIXTURE}?view=journey&section=races`)
  // A Major is recorded from its medal; the result form asks for one outcome and no second date.
  await page.getByRole('button', { name: /^London A finish still to come Record a finish$/ }).click()
  await page.getByLabel('Event date', { exact: true }).fill('2026-04-26')
  await page.getByRole('button', { name: 'Continue to result', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Finished', exact: true })).toBeChecked()
  await expect(page.getByLabel('Race date', { exact: true })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Hours', exact: true }).fill('4')
  await page.getByLabel('Time source', { exact: true }).selectOption('OfficialChip')
  await page.getByRole('button', { name: 'Save race result', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Something went wrong on our side')
  await expect(page.getByRole('textbox', { name: 'Hours', exact: true })).toHaveValue('4')
  await page.getByRole('button', { name: 'Save race result', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'RACE FINISHED.' })).toBeVisible()
  await page.getByRole('button', { name: 'Back to my journey', exact: true }).click()
  expect(state.writes).toHaveLength(2)
  expect(state.writes[0].id).toBe(state.writes[1].id)
  await expect(page.getByRole('button', { name: /^London Finished.*View finishes$/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /^London Finished.*View finishes$/ })).toBeVisible()
  await page.getByRole('button', { name: /^London Finished.*View finishes$/ }).click()
  await page.getByRole('button', { name: 'Edit result for London Marathon', exact: true }).click()
  await page.getByRole('button', { name: 'Continue to result', exact: true }).click()
  await page.getByRole('radio', { name: 'Didn’t finish', exact: true }).check()
  await page.getByRole('button', { name: 'Save race result', exact: true }).click()
  await expect(page.getByRole('list', { name: 'Saved races', exact: true })).toContainText('Didn’t finish')
  await expect(page.getByRole('button', { name: /^London A finish still to come Record a finish$/ })).toBeVisible()
  await expect(page.getByRole('list', { name: 'All race finishes', exact: true })).toHaveCount(0)
  expect(state.races).toHaveLength(1)
})

test('adding a past race reuses the selected recording date and elapsed metrics before explicit confirmation @phone', async ({ page }) => {
  const state = await fixture(page, { recording: true })
  await page.goto(`${FIXTURE}?view=journey&section=races`)
  await page.getByRole('button', { name: /^London A finish still to come Record a finish$/ }).click()
  await expect(page.getByLabel('Event distance (km)', { exact: true })).toHaveValue('42.195')
  await page.getByRole('combobox', { name: 'Use a recorded run (optional)', exact: true }).selectOption('eeeeeeee-0000-4000-8000-000000000005')
  await expect(page.getByLabel('Event date', { exact: true })).toHaveValue('2026-04-26')
  await page.getByRole('button', { name: 'Continue to result', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'We found your London Marathon.', exact: true })).toBeVisible()
  expect(state.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Confirm my recorded finish', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'RACE FINISHED.' })).toContainText('4:03:32')
  expect(state.writes).toHaveLength(1)
  expect(state.writes[0].body).toMatchObject({ raceDate: '2026-04-26', finishTime: '04:03:32', distanceKm: 42.4, timeKind: 'RecordedElapsed', activityId: 'eeeeeeee-0000-4000-8000-000000000005' })
  await page.getByRole('button', { name: 'Back to my journey', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('list', { name: 'Saved races', exact: true })).toContainText('Recording elapsed time')
})

test('cabinet uses the Night Run identity, wraps across screen sizes and passes both themes @phone', async ({ context }, info) => {
  for (const width of [375, 820, 1440]) for (const theme of ['light', 'dark']) {
    // Firefox can crash in native geometry checks after repeated live resizes.
    // Audit each actual theme/width in a fresh page, retaining every WCAG rule.
    const page = await context.newPage()
    try {
      await page.setViewportSize({ width, height: 900 })
      await fixture(page, { races: seedMemories() })
      await page.addInitScript(value => localStorage.setItem('taperday:theme', value), theme)
      await page.goto(`${FIXTURE}?view=journey&section=cabinet`)
      // An old link to the separate cabinet opens the combined Races & trophies section.
      await expect(page.getByRole('heading', { name: 'Trophy cabinet.', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Races & trophies', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      await expect(page.getByRole('button', { name: 'Dark mode', exact: true })).toHaveAttribute('aria-pressed', String(theme === 'dark'))
      await page.evaluate(() => document.fonts.ready)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
      expect(result.violations.map(violation => ({ id: violation.id, targets: violation.nodes.map(node => node.target) }))).toEqual([])
      const smallTargets = await page.locator('.cabinet-slot, .journey-sections button').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().height < 44).map(element => element.textContent))
      expect(smallTargets).toEqual([])
      await page.screenshot({ path: info.outputPath(`cabinet-${width}-${theme}.png`), fullPage: true })
      if (width === 1440 && theme === 'dark') {
        await page.getByRole('heading', { name: 'Your races.', exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: info.outputPath('race-history-desktop.png'), fullPage: true })
      }
    } finally {
      await page.close()
    }
  }
})

test('cabinet PNG, SVG fallback and prepared native-file sharing contain the same earned collection @phone', async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (data: ShareData) => !!data.files?.length })
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => {
      ;(window as unknown as { sharedFiles: { name: string; type: string }[] }).sharedFiles = (data.files ?? []).map(file => ({ name: file.name, type: file.type }))
    } })
  })
  await fixture(page, { races: seedMemories() })
  await page.goto(`${FIXTURE}?view=journey&section=cabinet`)
  const share = page.getByRole('button', { name: 'Share my cabinet', exact: true })
  await expect(share).toBeEnabled()
  await share.click()
  expect(await page.evaluate(() => (window as unknown as { sharedFiles: unknown }).sharedFiles)).toEqual([{ name: 'taperday-trophy-cabinet.png', type: 'image/png' }])
  const pngDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save cabinet card', exact: true }).click()
  const png = await pngDownload
  await png.saveAs(info.outputPath('cabinet-card.png'))
  const bytes = await readFile(info.outputPath('cabinet-card.png'))
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1080, 1920])
  await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null })
  const svgDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Save cabinet card', exact: true }).click()
  const svg = await svgDownload
  expect(svg.suggestedFilename()).toBe('taperday-trophy-cabinet.svg')
  await svg.saveAs(info.outputPath('cabinet-card.svg'))
  const content = await readFile(info.outputPath('cabinet-card.svg'), 'utf8')
  expect(content).toContain('width="1080" height="1920"')
  expect(content).toContain('2/8')
  expect(content).toContain('London')
  expect(content).toContain('Berlin')
  // Open the actual standalone fallback with system fonts and check its text bounds, not only its XML payload.
  await page.setViewportSize({ width: 540, height: 960 })
  await page.setContent(`<style>body{margin:0}svg{display:block;width:100%;height:auto}</style><main>${content}</main>`)
  const overflow = await page.locator('svg text').evaluateAll(elements => elements.filter(element => {
    const bounds = (element as SVGGraphicsElement).getBBox()
    return bounds.x < 0 || bounds.y < 0 || bounds.x + bounds.width > 1080.5 || bounds.y + bounds.height > 1920.5
  }).map(element => element.textContent))
  expect(overflow).toEqual([])
  await page.screenshot({ path: info.outputPath('cabinet-svg-fallback.png'), fullPage: true })
})
