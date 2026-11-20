import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from './axe'

const fixture = 'http://127.0.0.1:5176/e2e/fixtures/ai-coach.html'
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

const calls = (page: Page) => page.evaluate(() => (window as unknown as { coachCalls: { name: string; args: unknown[] }[] }).coachCalls)
const noSidewaysScroll = async (page: Page, what: string) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${what} at ${width}px`).toBeLessThanOrEqual(1)
  }
}
const audit = async (page: Page, scheme: 'light' | 'dark') => {
  await page.emulateMedia({ colorScheme: scheme })
  const result = await new AxeBuilder({ page }).include('.ai-coach').withTags(WCAG).analyze()
  expect(result.violations, `${scheme}: ${result.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`).join('; ')}`).toEqual([])
}

test('a runner asks the coach, sees the change before and after, applies it and undoes it, at every width @phone', async ({ page }, info) => {
  await page.goto(fixture)
  const coach = page.getByRole('region', { name: 'Coach' })
  await expect(coach.getByRole('button', { name: 'Ask the coach' })).toHaveAttribute('aria-expanded', 'false')
  expect(await calls(page)).toEqual([])

  await coach.getByRole('button', { name: 'Ask the coach' }).click()
  await expect(coach.getByRole('checkbox', { name: 'Use AI to understand my questions' })).not.toBeChecked()
  await coach.getByRole('textbox', { name: 'Your question' }).fill('Make my long run shorter')
  expect(await calls(page)).toEqual([])
  await coach.getByRole('button', { name: 'Ask', exact: true }).click()

  const card = coach.getByRole('article', { name: 'Suggested change' })
  await expect(card).toBeVisible()
  await expect(card.getByText('Week total: 17 km → 15 km')).toBeVisible()
  await expect(coach.getByText(/Strava runs aren’t used: 2 Strava-linked runs left out\./)).toBeVisible()
  await expect(coach.getByText('Guidance, not medical advice. Nothing changes until you apply it.')).toBeVisible()
  await expect(coach.locator('.ai-coach-result')).toBeFocused()
  expect((await calls(page)).map(call => call.name)).toEqual(['ask'])

  await noSidewaysScroll(page, 'the suggested change')
  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await audit(page, scheme)
    await coach.screenshot({ path: info.outputPath(`ai-coach-proposal-${scheme}-${size}.png`), animations: 'disabled' })
  }

  await card.getByRole('button', { name: 'Apply this change' }).click()
  await expect(coach.getByRole('status')).toContainText('Done. Your plan is updated.')
  await coach.getByRole('button', { name: 'Undo' }).click()
  await expect(coach.getByRole('status')).toContainText('back as your plan first wrote it')
  expect((await calls(page)).map(call => call.name)).toEqual(['ask', 'apply', 'restore'])
  expect((await calls(page))[2]!.args).toEqual([['2026-10-25']])

  // Next week belongs to the weekly review: the coach points there rather than repeating it.
  await coach.getByRole('button', { name: 'How should next week change?' }).click()
  await coach.getByRole('button', { name: 'Review next week' }).click()
  expect((await calls(page)).at(-1)!.name).toBe('openWeeklyReview')
})

test('a runner changes one run exactly, in miles, and the coach checks it first @phone', async ({ page }, info) => {
  await page.goto(`${fixture}?units=mi`)
  const coach = page.getByRole('region', { name: 'Coach' })
  await coach.getByRole('button', { name: 'Ask the coach' }).click()
  await coach.getByRole('radio', { name: 'Change a run' }).check()
  await coach.getByRole('combobox', { name: 'Which run?' }).selectOption('2026-10-25')
  // The choice of time, distance or pace is a radio group: arrow keys move through it.
  await coach.getByRole('radio', { name: 'Time' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(coach.getByRole('radio', { name: 'Distance' })).toBeChecked()
  await coach.getByRole('textbox', { name: 'Distance in miles' }).fill('3')
  await coach.getByRole('button', { name: 'Check this change' }).click()

  const card = coach.getByRole('article', { name: 'Suggested change' })
  await expect(card).toBeVisible()
  expect((await calls(page)).at(-1)).toEqual({ name: 'preview', args: [{ date: '2026-10-25', kind: 'Distance', km: 4.83 }] })
  await expect(coach.getByText('Checked by Taperday’s training rules.')).toBeVisible()

  await noSidewaysScroll(page, 'a structured change')
  const size = info.project.name === 'phone' ? 390 : 1440
  await page.setViewportSize({ width: size, height: 900 })
  for (const scheme of ['light', 'dark'] as const) {
    await audit(page, scheme)
    await coach.screenshot({ path: info.outputPath(`ai-coach-change-${scheme}-${size}.png`), animations: 'disabled' })
  }

  await card.getByRole('button', { name: 'Apply this change' }).click()
  await expect(coach.getByRole('status')).toContainText('Done. Your plan is updated.')
})
