import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import type { CheckIn, CheckInRequest, SyncedCompletion } from '../src/lib/types'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

// The fixture's today is Sunday 18 October: a 6 km long run. Strava has a 5.9 km run for it (synthetic, never stored).
const longRun: SyncedCompletion = {
  date: '2026-10-18', sessionType: 'LongRun', activityId: 'synthetic-strava', state: 'Completed', measure: 'Distance', plannedKm: 6, actualKm: 5.9,
  plannedSeconds: 0, actualSeconds: 2124, feedback: 'OnTarget', cachedUntil: new Date(Date.now() + 7 * 86400000).toISOString(),
}

const easierWeek = {
  token: 'e'.repeat(64),
  summary: 'Two runs this week felt harder than they should. Ease the rest of the week: hard sessions become easy runs, and no kilometres are made up.',
  changes: [{ appliedOn: '2026-10-18', date: '2026-10-20', originalType: 'Fartlek', originalTitle: 'Fartlek', originalKm: 6.5, easyKm: 5.25 }],
  proposed: plan,
}

/** Synthetic API on the local Vite server only: what the runner saves is all the "server" keeps. */
async function api(page: Page, options: { suggest?: boolean } = {}) {
  const state = { entries: [] as CheckIn[], held: true, writes: [] as CheckInRequest[], weekChecks: [] as string[], applied: [] as unknown[], restored: [] as unknown[] }
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    let data: unknown = []
    if (path.endsWith('/coach')) data = { id: 'rating-plan', plan, coaching: [] }
    else if (path.endsWith('/strava-completions')) data = state.held && !state.entries.some(c => c.date === longRun.date) ? [longRun] : []
    else if (path.endsWith('/remaining-week/proposal')) {
      state.weekChecks.push(url.search)
      data = options.suggest && state.applied.length === 0 ? easierWeek : { ...easierWeek, changes: [] }
    } else if (path.endsWith('/remaining-week/apply')) { state.applied.push(request.postDataJSON()); data = easierWeek }
    else if (path.endsWith('/adjustments/restore')) { state.restored.push(request.postDataJSON()); data = { id: 'rating-plan', name: 'Spring 5K', plan } }
    else if (path.includes('/check-ins')) {
      if (request.method() === 'PUT') {
        const parts = path.split('/')
        const body = request.postDataJSON() as CheckInRequest
        state.writes.push(body)
        const saved = { ...body, pain: body.pain ?? 'None', date: parts.at(-2), sessionType: parts.at(-1), isAdditional: false, updatedAt: new Date().toISOString() } as CheckIn
        state.entries = [...state.entries.filter(c => c.date !== saved.date), saved]
        data = saved
      } else data = state.entries
    }
    await route.fulfill({ json: data })
  })
  return state
}

const open = (page: Page) => page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-18&km=5.9')

async function noSidewaysScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}

// The runner's own answer, and nothing measured: no Strava distance, time, pace, heart rate or id.
const ownAnswer = (effort: number) => ({ status: 'Done', effort, pain: 'None', painArea: null, distanceKm: null, duration: null, activityId: null, note: null, actualSessionType: null, distanceUnreported: false })

test('rates today’s Strava run in two taps on Home, edits it, and the answer outlives the Strava copy @phone', async ({ page }) => {
  const state = await api(page)
  await open(page)
  const today = page.getByRole('region', { name: 'Today', exact: true })
  const prompt = today.getByRole('region', { name: 'Rate today’s run', exact: true })
  await expect(prompt.getByText('Completed via Strava', { exact: true })).toBeVisible()
  await expect(prompt.getByRole('group', { name: 'How hard did it feel?' })).toBeVisible()
  await expect(prompt.getByText('Expected for long run: 3–5/10.')).toBeVisible()
  await expect(prompt.getByRole('button', { name: 'Save as planned' })).toBeDisabled()

  // Two taps.
  await prompt.getByRole('radio', { name: '4, Comfortable' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()
  await expect(prompt.getByText('Rated 4/10 · As planned', { exact: true })).toBeVisible()
  await expect(prompt.locator('.post-run-rating-summary')).toBeFocused()
  expect(state.writes).toEqual([ownAnswer(4)])
  expect(JSON.stringify(state.writes)).not.toContain('synthetic-strava')
  expect(state.weekChecks).toEqual(['?reported=true'])

  // Edit in place: the same check-in.
  await prompt.getByRole('button', { name: 'Edit feedback for Long run' }).click()
  await prompt.getByRole('radio', { name: '6, Working' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()
  await expect(prompt.getByText('Rated 6/10 · As planned', { exact: true })).toBeVisible()
  expect(state.writes.at(-1)).toEqual(ownAnswer(6))
  expect(state.entries).toHaveLength(1)

  // The Strava copy lapses: the runner's answer stays, and Home shows the session done by them.
  state.held = false
  await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
  await page.reload()
  await expect(today.locator('.home-done-chip')).toHaveText(/Done/)
  await expect(today.getByText('Confirmed without recorded measurements', { exact: true })).toBeVisible()
})

test('a rating that brings a suggestion: review, apply, undo; nothing changes by itself', async ({ page }) => {
  const state = await api(page, { suggest: true })
  await open(page)
  const prompt = page.getByRole('region', { name: 'Rate today’s run', exact: true })
  await prompt.getByRole('radio', { name: '8, Very hard' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()

  const suggestion = prompt.getByRole('region', { name: 'Suggested change to this week' })
  await expect(suggestion.getByRole('heading', { name: 'Ease the rest of this week?' })).toBeVisible()
  await expect(suggestion.getByText(/Fartlek · 6\.5 km → Easy run · 5\.25 km/)).toBeVisible()
  expect(state.applied).toEqual([])
  await suggestion.getByRole('button', { name: 'Apply this easier week' }).click()
  await expect(prompt.getByText(/Rest of this week eased/)).toBeVisible()
  expect(state.applied).toEqual([{ token: 'e'.repeat(64), reported: true }])
  await prompt.getByRole('button', { name: 'Undo' }).click()
  await expect(prompt.getByText('Back as planned.')).toBeVisible()
  expect(state.restored).toEqual([{ dates: ['2026-10-20'] }])
})

test('Keep my plan saves nothing and doesn’t ask again for the same suggestion', async ({ page }) => {
  const state = await api(page, { suggest: true })
  await open(page)
  const prompt = page.getByRole('region', { name: 'Rate today’s run', exact: true })
  await prompt.getByRole('radio', { name: '8, Very hard' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()
  await prompt.getByRole('button', { name: 'Keep my plan' }).click()
  await expect(prompt.getByText('Your plan stays as it is.')).toBeVisible()

  await prompt.getByRole('button', { name: 'Edit feedback for Long run' }).click()
  await prompt.getByRole('radio', { name: '9, Near my limit' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()
  await expect(prompt.getByText('Rated 9/10 · As planned', { exact: true })).toBeVisible()
  await expect(prompt.getByRole('heading', { name: 'Ease the rest of this week?' })).toHaveCount(0)
  expect(state.applied).toEqual([])
})

test('a rating made offline waits on the device, then syncs once back online', async ({ page, context }) => {
  const state = await api(page)
  await open(page)
  const prompt = page.getByRole('region', { name: 'Rate today’s run', exact: true })
  await expect(prompt.getByRole('group', { name: 'How hard did it feel?' })).toBeVisible()
  await context.setOffline(true)
  await prompt.getByRole('radio', { name: '3, Easy, chatty' }).check()
  await prompt.getByRole('button', { name: 'Save as planned' }).click()
  await expect(prompt.getByText('Rated 3/10 · As planned', { exact: true })).toBeVisible()
  await expect(prompt.getByRole('status').filter({ hasText: 'Saved on this device, syncing' })).toBeVisible()
  expect(state.writes).toEqual([])

  await context.setOffline(false)
  await expect.poll(() => state.writes.length).toBe(1)
  // Sent with the outbox's version guards, so a newer answer from another device is never overwritten (R11).
  expect(state.writes[0]).toEqual({ ...ownAnswer(3), expectedVersion: null, expectMissing: true })
  await expect(prompt.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible()
})

test('works by keyboard with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const state = await api(page)
  await open(page)
  const prompt = page.getByRole('region', { name: 'Rate today’s run', exact: true })
  await prompt.getByRole('radio', { name: '3, Easy, chatty' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await expect(prompt.getByRole('radio', { name: '4, Comfortable' })).toBeChecked()
  await prompt.getByRole('button', { name: 'Save as planned' }).focus()
  await page.keyboard.press('Enter')
  await expect(prompt.getByText('Rated 4/10 · As planned', { exact: true })).toBeVisible()
  expect(state.writes).toEqual([ownAnswer(4)])
})

test('fits 320 px, 390 px and desktop in light and dark, with no chat anywhere', async ({ page }, info) => {
  await api(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await open(page)
      const prompt = page.getByRole('region', { name: 'Rate today’s run', exact: true })
      await prompt.getByRole('radio', { name: '4, Comfortable' }).check()
      await noSidewaysScroll(page)
      // Five by two on a narrow phone; one row of ten on desktop. Every choice is a comfortable tap.
      const first = await prompt.locator('.rating-scale .pill').nth(0).boundingBox()
      const sixth = await prompt.locator('.rating-scale .pill').nth(5).boundingBox()
      if (width <= 480) expect(sixth!.y).toBeGreaterThan(first!.y)
      else expect(Math.abs(sixth!.y - first!.y)).toBeLessThan(2)
      expect(first!.height).toBeGreaterThanOrEqual(44)
      await prompt.screenshot({ path: info.outputPath(`post-run-rating-${scheme}-${width}.png`) })
    }
  }
  // The plan has no conversational coach, question box or AI switch (Q296-04, R21).
  await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Calendar' })).toBeVisible()
  await expect(page.getByRole('button', { name: /ask the coach/i })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: /your question/i })).toHaveCount(0)
  await expect(page.getByText(/\bAI\b/)).toHaveCount(0)
})
