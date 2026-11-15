import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { cardSvg } from '../src/features/journey/share-card'

// The finish-line journey on the real React screens, against a synthetic in-memory journey (e2e/fixtures/finish-line.tsx).
// Screenshots land in docs/qa/2026-11-14/finish-line so the pull request can show the real implementation.
const FIXTURE = 'http://127.0.0.1:5176/e2e/fixtures/finish-line.html'
const shot = (name: string) => fileURLToPath(new URL(`../../docs/qa/2026-11-14/finish-line/${name}.png`, import.meta.url))
const open = (page: Page, scene: string, today: string, extra = '') => page.goto(`${FIXTURE}?scene=${scene}&today=${today}${extra}`)
const theme = (page: Page, value: 'light' | 'dark') => page.evaluate((t) => { document.documentElement.dataset.theme = t }, value)

async function noSideScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
}

async function targetsAreTappable(page: Page, scope: string) {
  const small = await page.locator(`${scope} button:visible`).evaluateAll(buttons => buttons
    .map(b => ({ text: (b.textContent ?? '').trim(), ...b.getBoundingClientRect().toJSON() as { width: number; height: number } }))
    .filter(b => b.height < 43.5 && !b.text.startsWith('Not ready to choose')))
  expect(small).toEqual([])
}

async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  expect(result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
}

test.describe('finish line journey', () => {
  test('race result → race celebration → recovery → recovered → maintenance, on a phone @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'race-result', '2026-11-16')
    await expect(page.getByRole('heading', { name: 'Your race result' })).toBeVisible()
    await expect(page.getByText(/recorded run will appear here/)).toBeVisible()
    await page.screenshot({ path: shot('04-race-result-ask-phone-light'), fullPage: true })

    await page.getByRole('button', { name: 'I finished' }).click()
    await page.getByRole('textbox', { name: 'Hours' }).fill('1')
    await page.getByRole('textbox', { name: 'Minutes' }).fill('52')
    await page.getByRole('textbox', { name: 'Seconds' }).fill('10')
    await page.screenshot({ path: shot('04-race-result-form-phone-light'), fullPage: true })
    await page.getByRole('button', { name: 'Save race result' }).click()

    // The race is its own milestone: its own film, distinct from the training one.
    const film = page.getByRole('dialog', { name: 'RACE FINISHED.' })
    await expect(film).toBeVisible()
    await expect(film.getByText('1:52:10')).toBeVisible()
    await page.screenshot({ path: shot('05-race-celebration-phone-light') })
    await page.keyboard.press('Escape')
    await expect(film).toBeHidden()
    await expect(page.locator('.race-result-event')).toHaveText('Hoka Half Marathon')
    await expect(page.getByRole('heading', { name: 'Finished in 1:52:10' })).toBeVisible()
    await expect(page.locator('.race-result.is-saved .plan-kicker')).toContainText('Finished')
    await expect(page.getByRole('button', { name: 'I finished', exact: true })).toHaveCount(0)

    // Recovery is offered, optional, and shaped by the runner's answers.
    await page.getByText('Plan my recovery', { exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Want a gentle recovery plan?' })).toBeVisible()
    await page.getByText('Adjust recovery preferences', { exact: true }).click()
    await page.getByLabel(/All out/).check()
    await page.screenshot({ path: shot('06-recovery-offer-phone-light'), fullPage: true })
    await page.getByRole('button', { name: 'Start my recovery' }).click()
    await expect(page.getByText(/^Recovery · day \d+$/)).toBeVisible()
    await page.getByRole('button', { name: 'Good to go' }).click()
    await expect(page.getByRole('button', { name: 'Good to go' })).toHaveAttribute('aria-pressed', 'true')
    await page.screenshot({ path: shot('07-recovery-home-checkin-phone-light'), fullPage: true })
    await page.getByRole('button', { name: 'I feel recovered' }).click()

    await expect(page.getByRole('heading', { name: 'Choose your next chapter.' })).toBeVisible()
    await page.screenshot({ path: shot('09-next-challenge-phone-light'), fullPage: true })
    await page.getByRole('button', { name: /Keep running comfortably/ }).click()
    await page.getByRole('button', { name: 'Start easy running' }).click()
    await expect(page.getByRole('heading', { name: /easy runs a week/ })).toBeVisible()
    await noSideScroll(page)
    await page.screenshot({ path: shot('10-maintenance-phone-light'), fullPage: true })
  })

  test('already-imported Strava marathon is detected, confirmed once, celebrated and shareable @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'strava-marathon', '2026-11-14')
    await expect(page.getByRole('heading', { name: 'We found your Mandela Marathon.' })).toBeVisible()
    await expect(page.getByText(/No need to type the result again/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Confirm my recorded finish' })).toBeEnabled()
    await expect(page.getByRole('heading', { name: 'How did race day go?' })).toHaveCount(0)
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(page.locator('.journey-training')).not.toHaveAttribute('open')
    const resultWidth = await page.locator('.journey-race-summary').evaluate(element => element.getBoundingClientRect().width)
    expect(resultWidth).toBeLessThanOrEqual(760)
    expect(resultWidth).toBeGreaterThan(600)
    await page.setViewportSize({ width: 375, height: 812 })
    await accessible(page)
    await page.screenshot({ path: shot('12-strava-marathon-found-phone'), fullPage: true })

    await page.getByRole('button', { name: 'Confirm my recorded finish' }).click()
    const film = page.getByRole('dialog', { name: 'RACE FINISHED.' })
    await expect(film).toBeVisible()
    await film.getByRole('button', { name: 'Close the Finish Line' }).click()
    await expect(page.getByRole('heading', { name: 'Finished in 4:40:12' })).toBeVisible()
    await expect(page.locator('.race-result-event')).toHaveText('Mandela Marathon')
    await expect(page.locator('.race-result.is-saved .plan-kicker')).toContainText('Finished')
    await noSideScroll(page)
    await accessible(page)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save race card' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('taperday-race-finish.png')
    const png = await readFile((await file.path())!)
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1080, 1920])
    await page.screenshot({ path: shot('13-strava-marathon-finish-phone'), fullPage: true })
  })

  test('past Strava chapter: failed confirmation → retry → edit → reload → undo @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'strava-history', '2026-11-14', '&saveFail=1')
    await page.getByRole('button', { name: 'View chapter' }).click()
    await expect(page.getByRole('heading', { name: 'We found your Mandela Marathon.' })).toBeVisible()
    await page.getByRole('button', { name: 'Confirm my recorded finish' }).click()
    await expect(page.getByRole('alert')).toContainText(/try again/i)
    await expect(page.getByRole('textbox', { name: 'Minutes' })).toHaveValue('40')
    await page.getByRole('button', { name: 'Save race result' }).dblclick()
    await expect(page.getByRole('dialog', { name: 'RACE FINISHED.' })).toBeVisible()
    await page.getByRole('button', { name: 'Close the Finish Line' }).click()
    await expect(page.getByRole('heading', { name: 'Finished in 4:40:12' })).toBeVisible()
    await page.getByText('Race details & corrections', { exact: true }).click()
    await page.getByRole('button', { name: 'Edit result' }).click()
    await page.getByRole('textbox', { name: 'Minutes' }).fill('39')
    await page.getByRole('button', { name: 'Save race result' }).click()
    await expect(page.getByRole('heading', { name: 'Finished in 4:39:12' })).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'View chapter' }).click()
    await expect(page.getByRole('heading', { name: 'Finished in 4:39:12' })).toBeVisible()
    await noSideScroll(page)
    await accessible(page)
    await page.getByText('Race details & corrections', { exact: true }).click()
    await page.getByRole('button', { name: 'Undo' }).click()
    await page.getByRole('button', { name: 'Remove result' }).click()
    await expect(page.getByRole('heading', { name: 'We found your Mandela Marathon.' })).toBeVisible()
    await expect(page.getByText('✓ Race finisher')).toHaveCount(0)
  })

  test('unavailable past recording leaves manual entry and no finisher award', async ({ page }) => {
    await open(page, 'strava-history', '2026-11-14', '&expired=1')
    await page.getByRole('button', { name: 'View chapter' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText('✓ Race finisher')).toHaveCount(0)
    await page.getByText('Add a different result', { exact: true }).click()
    await page.getByRole('button', { name: 'I finished' }).click()
    await expect(page.getByRole('textbox', { name: 'Hours' })).toHaveValue('')
  })

  test('a historical recorded finish celebrates and starts recovery without retyping @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'strava-history', '2026-10-19')
    await page.getByRole('button', { name: 'View chapter' }).click()
    await page.getByRole('button', { name: 'Confirm my recorded finish' }).click()
    const film = page.getByRole('dialog', { name: 'RACE FINISHED.' })
    await expect(film.getByText('4:40:12')).toBeVisible()
    await film.getByRole('button', { name: 'Back to my journey' }).click()
    await expect(page.getByText('✓ Race finisher · 18 Oct')).toBeVisible()
    await page.getByRole('button', { name: 'Plan recovery from this race' }).click()
    await expect(page.getByRole('heading', { name: 'Want a gentle recovery plan?' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Distance (km)' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Start my recovery' }).dblclick()
    await expect(page.getByRole('heading', { name: 'Rest is training too.' })).toBeVisible()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('test:past-marathon-journey')!).recovery)
    expect(saved).toMatchObject({ planId: '11111111-1111-4111-8111-111111111111', eventName: 'Mandela Marathon', raceDate: '2026-10-18', distanceKm: 42.35 })
    await page.reload()
    await page.getByRole('button', { name: 'View chapter' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Rest is training too.' })).toBeVisible()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('test:past-marathon-journey')!).recovery.id)).toBe(saved.id)
    await accessible(page)
    await noSideScroll(page)
  })

  test('duplicate recordings require a choice and confirmation on a phone @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'strava-marathon', '2026-11-14', '&duplicate=1')
    const confirm = page.getByRole('button', { name: 'Confirm my recorded finish' })
    await expect(confirm).toBeDisabled()
    await page.getByRole('combobox', { name: /Choose your race recording/ }).selectOption('44444444-4444-4444-8444-444444444444')
    await expect(confirm).toBeEnabled()
    await expect(page.locator('.journey-badges').getByText(/✓ Race finisher/)).toHaveCount(0)
    await noSideScroll(page)
    await accessible(page)
    await confirm.click()
    await page.getByRole('button', { name: 'Close the Finish Line' }).click()
    await expect(page.getByRole('heading', { name: 'Finished in 4:40:12' })).toBeVisible()
  })

  test('story hands a portrait PNG to native sharing and saves SVG when canvas is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      let inGesture = false
      // Capture starts the gesture; the window's bubble listener ends it after React's click handler.
      // A microtask reset in capture would incorrectly run before React receives a genuine click.
      document.addEventListener('click', () => { inGesture = true }, true)
      window.addEventListener('click', () => { inGesture = false })
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
      Object.defineProperty(navigator, 'share', { value: async (data: ShareData) => {
        if (!inGesture || !navigator.userActivation.isActive) throw new DOMException('Sharing must start in the tap handler', 'NotAllowedError')
        const file = data.files![0]!
        const bitmap = await createImageBitmap(file)
        Object.assign(window, { sharedCard: { name: file.name, type: file.type, width: bitmap.width, height: bitmap.height } })
        bitmap.close()
      }, configurable: true })
    })
    await open(page, 'training-complete', '2026-11-14')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Share my story' }).click()
    await expect(page.getByRole('status')).toHaveText('Shared.')
    expect(await page.evaluate(() => Reflect.get(window, 'sharedCard'))).toEqual({ name: 'taperday-training-story.png', type: 'image/png', width: 1080, height: 1920 })
    await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = () => null })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save story card' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('taperday-training-story.svg')
    const svg = await readFile((await file.path())!, 'utf8')
    expect(svg).toContain('TRAINING COMPLETE')
    expect(svg).toContain('38/38')
    await expect(page.getByText('Card saved as an SVG picture.')).toBeVisible()
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { value: async () => { throw new DOMException('Cancelled', 'AbortError') }, configurable: true })
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { Object.assign(window, { unexpectedCopy: true }) } }, configurable: true })
    })
    await page.getByRole('button', { name: 'Share my story' }).click()
    await expect(page.getByRole('button', { name: 'Share my story' })).toBeEnabled()
    expect(await page.evaluate(() => Reflect.get(window, 'unexpectedCopy'))).toBeUndefined()
    await expect(page.getByRole('status')).toHaveText('')
  })

  test('SVG fallback keeps long names and labels inside the portrait card', async ({ page }) => {
    const svg = cardSvg({ kicker: 'TAPERDAY · TRAINING STORY', heading: 'TRAINING COMPLETE', raceName: 'The Very Long Named Coastal Sunrise Half Marathon',
      stats: [{ value: '138/138', label: 'Training runs confirmed' }, { value: '24', label: 'Training weeks' }, { value: '1234.5 km', label: 'Recorded training distance' }],
      footer: 'EVERY FINISH IS A BEGINNING · taperday.run' })
    await page.setContent(svg)
    const overflowing = await page.locator('svg text').evaluateAll(nodes => nodes.filter(node => {
      const box = (node as SVGGraphicsElement).getBBox()
      return box.x < 78 || box.x + box.width > 1002
    }).map(node => node.textContent))
    expect(overflowing).toEqual([])
    const runner = await page.locator('svg g').boundingBox()
    const heading = await page.locator('svg text').filter({ hasText: /^TRAINING COMPLETE$/ }).boundingBox()
    expect(runner).not.toBeNull()
    expect(heading).not.toBeNull()
    expect(runner!.y + runner!.height).toBeLessThan(heading!.y)
    await expect(page.locator('svg text').filter({ hasText: 'RECORDED TRAINING' })).toHaveText('RECORDED TRAINING')
    await expect(page.locator('svg text').filter({ hasText: /^DISTANCE$/ })).toHaveCount(1)
  })

  test('training film: plays once, keyboard-safe, with a still version for reduced motion @phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await open(page, 'training-complete', '2026-11-14')
    const film = page.getByRole('dialog', { name: 'YOU DID IT.' })
    await expect(film).toBeVisible()
    await page.waitForTimeout(450)
    await page.screenshot({ path: shot('02-finish-film-mid-run-phone-light') })
    await page.waitForTimeout(2000)
    await page.screenshot({ path: shot('02-finish-film-revealed-phone-light') })
    await expect(film.getByRole('button', { name: 'See my training story' })).toBeFocused()
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      expect(await film.evaluate(d => d.contains(document.activeElement))).toBe(true)
    }
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await film.getByRole('button', { name: 'See my training story' }).click()
    await expect(film).toBeHidden()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('')
    await expect(page.getByRole('heading', { name: 'Training complete.' })).toBeVisible()
    await expect(page.getByText('Training done. The race is still ahead.')).toBeVisible()
    await page.screenshot({ path: shot('03-training-story-phone-light'), fullPage: true })
    await theme(page, 'dark')
    await page.screenshot({ path: shot('03-training-story-phone-dark'), fullPage: true })

    // Replay is the runner's choice; reduced motion shows the same beats, still.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.getByRole('button', { name: 'Replay finish line' }).click()
    await expect(film).toBeVisible()
    await expect(film.getByText('YOU DID IT.')).toBeVisible()
    await page.screenshot({ path: shot('02-finish-film-reduced-motion-phone-dark') })
    await film.getByRole('button', { name: 'Close the Finish Line' }).click()
    await expect(page.getByRole('button', { name: 'Replay finish line' })).toBeFocused()
  })

  test('share card downloads as a picture', async ({ page }) => {
    await open(page, 'training-complete', '2026-11-14')
    await page.keyboard.press('Escape')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Save story card' }).click()
    expect((await download).suggestedFilename()).toBe('taperday-training-story.png')
    await expect(page.getByText('Card saved as a picture.')).toBeVisible()
  })

  for (const width of [320, 375, 768, 1024, 1440]) {
    for (const mode of ['light', 'dark'] as const) {
      test(`fits and passes accessibility checks at ${width}px, ${mode}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        for (const [scene, today] of [['training-complete', '2026-11-14'], ['recovery', '2026-11-18'], ['journey', '2026-11-26']] as const) {
          await open(page, scene, today)
          await theme(page, mode)
          if (scene === 'training-complete') await page.keyboard.press('Escape')
          await expect(page.locator('main')).not.toBeEmpty()
          if (scene === 'journey') await expect(page.getByText('Every finish is a beginning.')).toBeVisible()
          await noSideScroll(page)
          await targetsAreTappable(page, 'main')
          await accessible(page)
          if (width === 375 || width >= 1024) await page.screenshot({ path: shot(`matrix-${scene}-${width}-${mode}`), fullPage: true })
        }
      })
    }
  }

  test('edge cases: incomplete training, pain, plan ended mid-month, long names, empty and unavailable history', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })

    await open(page, 'incomplete', '2026-11-16')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Your race result' })).toBeVisible()
    await page.locator('.journey-training > summary').click()
    await expect(page.getByText('Not enough evidence')).toBeVisible()
    await page.screenshot({ path: shot('edge-incomplete-training-phone-light'), fullPage: true })

    await open(page, 'pain', '2026-11-18')
    await expect(page.getByRole('heading', { name: 'Let’s get that checked' })).toBeVisible()
    await expect(page.getByText('Today’s idea · optional')).toHaveCount(0)
    await page.screenshot({ path: shot('edge-pain-checkin-phone-light'), fullPage: true })

    await open(page, 'calendar', '2026-11-20')
    await expect(page.locator('[data-date="2026-11-16"]')).toHaveClass(/is-recovery/)
    await expect(page.locator('[data-date="2026-11-27"]')).toHaveClass(/is-outside/)
    await expect(page.locator('[data-date="2026-11-03"]')).toHaveClass(/is-outside/)
    await expect(page.locator('[data-date="2026-11-05"]')).toHaveClass(/is-rest/)
    await expect(page.locator('[data-date="2026-11-29"]')).toHaveClass(/is-recorded/)
    await expect(page.locator('[data-date="2026-11-27"]')).toHaveAttribute('aria-label', '27 November: outside this plan')
    await page.screenshot({ path: shot('08-recovery-calendar-ended-mid-month-phone-light'), fullPage: true })
    await theme(page, 'dark')
    await page.screenshot({ path: shot('08-recovery-calendar-ended-mid-month-phone-dark'), fullPage: true })

    await open(page, 'race-result', '2026-11-16', '&long=1')
    await noSideScroll(page)
    await page.screenshot({ path: shot('edge-very-long-race-name-phone-light'), fullPage: true })

    await open(page, 'empty-journey', '2026-11-16')
    await expect(page.getByText(/Your finished plans and race results will collect here/)).toBeVisible()
    await page.screenshot({ path: shot('edge-no-history-phone-light'), fullPage: true })

    await open(page, 'journey', '2026-11-16', '&fail=1')
    await expect(page.getByRole('alert')).toContainText('couldn’t load')
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await page.screenshot({ path: shot('edge-history-unavailable-phone-light'), fullPage: true })
  })

  test('home: recovery takes today’s place, and history opens a past chapter', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await open(page, 'home-recovery', '2026-11-18')
    await page.goto(`${FIXTURE}?scene=home-recovery&today=2026-11-18`)
    await page.screenshot({ path: shot('07-home-card-phone-light'), fullPage: true })

    await page.setViewportSize({ width: 1440, height: 900 })
    await open(page, 'journey', '2026-11-26')
    await page.getByRole('button', { name: 'View chapter' }).nth(1).click()
    await expect(page.getByRole('heading', { name: 'Parkrun 10K Challenge' })).toBeVisible()
    await expect(page.getByText('Confirmed runs, week by week')).toBeVisible()
    await page.screenshot({ path: shot('11-running-journey-desktop-light'), fullPage: true })
    await theme(page, 'dark')
    await page.screenshot({ path: shot('11-running-journey-desktop-dark'), fullPage: true })
  })
})
