import AxeBuilder from './axe'
import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { addDays, formatDate } from '../src/lib/format'
import { toSearchParams } from '../src/lib/plan-url'
import type { GeneratePlanRequest } from '../src/lib/types'

const qa = fileURLToPath(new URL('../../docs/qa/2026-11-15/manual-races/', import.meta.url))
const today = new Date().toISOString().slice(0, 10)
const raceDate = addDays(today, 84)
const raceName = 'Neighbourhood 15K'

async function chooseDate(page: Page) {
  await page.getByLabel('Race date', { exact: true }).click()
  const calendar = page.getByRole('dialog', { name: 'Choose a date', exact: true })
  const day = calendar.getByRole('button', { name: formatDate(raceDate, 'long'), exact: true })
  for (let months = 0; months < 4 && !await day.count(); months++) await calendar.getByRole('button', { name: 'Next month', exact: true }).click()
  await day.click()
}

async function finishQuestions(page: Page) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('group', { name: 'Suggested goal times' }).getByRole('button', { name: /Steady/ }).click()
  for (let step = 0; step < 2; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
}

test.describe('network failure recovery', () => {
  // Playwright cannot reliably intercept service-worker-owned requests in WebKit.
  // Only the simulated failure journeys block the worker; successful builds still use the real API.
  test.use({ serviceWorkers: 'block' })

  test('unlisted race → failed build → retry → actual plan → reload → edit preserves custom metadata @phone', async ({ page }) => {
    const requests: GeneratePlanRequest[] = []
    await page.route('**/api/v1/races/search**', route => route.fulfill({ json: [] }))
    await page.route('**/api/v1/plans', async route => {
      requests.push(route.request().postDataJSON())
      if (requests.length === 1) await route.fulfill({ status: 503, json: { title: 'Temporarily unavailable' } })
      else await route.continue()
    })
    await page.goto('/')
    await page.getByRole('searchbox', { name: 'Looking for another race?' }).fill(raceName)
    await expect(page.getByText(/No upcoming race matches/)).toBeVisible()
    await page.getByRole('button', { name: 'Add this race manually', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Name (optional)', exact: true })).toHaveValue(raceName)
    await expect(page.getByRole('textbox', { name: 'Name (optional)', exact: true })).toBeFocused()
    await expect(page.locator('.race-rack')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Distance (km)', exact: true }).fill('15.75')
    await chooseDate(page)
    await finishQuestions(page)
    await expect(page.getByText('We couldn’t build that plan.', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.getByRole('heading', { name: raceName, exact: true })).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[1]).toEqual(requests[0])
    expect(requests[1]).toMatchObject({ raceName, raceDate, distanceKm: 15.75, version: 3 })
    expect(requests[1].raceSlug).toBeNull()
    let query = new URL(page.url()).searchParams
    expect(query.get('km')).toBe('15.75')
    expect(query.get('name')).toBe(raceName)
    expect(query.get('date')).toBe(raceDate)
    expect(query.has('race')).toBe(false)
    await page.reload()
    await expect(page.getByRole('heading', { name: raceName, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click()
    await page.getByRole('button', { name: 'Change race', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Distance (km)', exact: true })).toHaveValue('15.75')
    await expect(page.getByLabel('Race date', { exact: true })).toHaveAccessibleDescription(formatDate(raceDate, 'long'))
    await page.getByRole('textbox', { name: 'Distance (km)', exact: true }).fill('15.76')
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Build my plan', exact: true }).click()
    await expect(page.getByRole('heading', { name: raceName, exact: true })).toBeVisible()
    query = new URL(page.url()).searchParams
    expect(query.get('km')).toBe('15.76')
    expect(requests.at(-1)).toMatchObject({ raceName, raceDate, distanceKm: 15.76, version: 3 })
  })

  test('manual entry remains available when the catalogue fails and can return to catalogue browsing @phone', async ({ page }) => {
    await page.route('**/api/v1/races', route => route.fulfill({ status: 503, json: {} }))
    await page.goto('/')
    await expect(page.getByText('We couldn’t load the race list.')).toBeVisible()
    await page.getByRole('radio', { name: /Add a race manually/ }).check()
    await page.getByRole('textbox', { name: 'Name (optional)', exact: true }).fill(raceName)
    await page.getByRole('radio', { name: '15K', exact: true }).check()
    await chooseDate(page)
    await page.getByRole('button', { name: 'Browse the catalogue instead', exact: true }).click()
    await page.unroute('**/api/v1/races')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.race-bib').first()).toBeVisible()
    await page.getByRole('radio', { name: /Add a race manually/ }).check()
    await expect(page.getByRole('textbox', { name: 'Name (optional)', exact: true })).toHaveValue(raceName)
    await expect(page.getByRole('textbox', { name: 'Distance (km)', exact: true })).toHaveValue('15')
    await finishQuestions(page)
    await expect(page.getByRole('heading', { name: raceName, exact: true })).toBeVisible()
  })

})

for (const width of [320, 375, 1440]) for (const mode of ['light', 'dark']) {
  test(`manual race fields are accessible at ${width}px in ${mode} mode @phone`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    // Audit the same populated fields from a freshly opened custom plan, separately
    // from calendar interactions (Firefox can crash inside axe after those interactions).
    const query = toSearchParams({ raceName, raceDate, distanceKm: 15, goalSeconds: 5400, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'],
      longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: today, version: 3 })
    await page.goto(`/?${query}`)
    await expect(page.getByRole('heading', { name: raceName, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Edit plan', exact: true }).click()
    await page.getByRole('button', { name: 'Change race', exact: true }).click()
    await page.evaluate(value => { document.documentElement.dataset.theme = value }, mode)
    await page.evaluate(() => document.fonts.ready)
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(result.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport()
    if (info.project.name === 'desktop') {
      await mkdir(qa, { recursive: true })
      await page.getByRole('heading', { name: 'Which race?', exact: true }).evaluate(element => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        element.scrollIntoView({ block: 'start' })
        window.scrollBy(0, -110)
      })
      await page.screenshot({ path: `${qa}/manual-${width}-${mode}.png` })
    }
  })
}
