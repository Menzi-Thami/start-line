import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

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
    await expect(page.getByRole('heading', { name: 'How did race day go?' })).toBeVisible()
    await expect(page.getByText(/never assumes a race was run/)).toBeVisible()
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
    await expect(film.getByText('2:50 faster than your 1:55:00 goal.')).toBeVisible()
    await page.screenshot({ path: shot('05-race-celebration-phone-light') })
    await page.keyboard.press('Escape')
    await expect(film).toBeHidden()
    await expect(page.getByRole('heading', { name: 'You finished Hoka Half Marathon.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Finished in 1:52:10' })).toBeVisible()
    await expect(page.locator('.journey-badges').getByText(/✓ Race finisher/)).toBeVisible()

    // Recovery is offered, optional, and shaped by the runner's answers.
    await expect(page.getByRole('heading', { name: 'Want a gentle recovery plan?' })).toBeVisible()
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
    await page.getByRole('button', { name: 'Download card' }).click()
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
    await expect(page.getByRole('heading', { name: 'Your training chapter.' })).toBeVisible()
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
