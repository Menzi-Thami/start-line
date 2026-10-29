import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import type { CheckIn, CheckInRequest } from '../src/lib/types'
import { formatDate } from '../src/lib/format'
const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

async function persistence(page: Page) {
  let entries: CheckIn[] = []
  let failDelete = false
  let writes = 0
  await page.route('**/api/v1/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let data: unknown = []
    if (path.endsWith('/coach')) data = { id: 'visibility-plan', plan, coaching: [] }
    else if (path.includes('/check-ins')) {
      const parts = path.split('/')
      const additional = path.includes('/additional/')
      const id = additional ? (request.method() === 'DELETE' ? parts.at(-1)! : parts.at(-3)!) : `${parts.at(-2)}|${parts.at(-1)}`
      if (request.method() === 'PUT') {
        writes++
        const body = request.postDataJSON() as CheckInRequest
        const saved = { ...body, pain: body.pain ?? 'None', painArea: body.painArea ?? null, effort: body.effort ?? null, id, date: parts.at(-2), sessionType: parts.at(-1), isAdditional: additional, updatedAt: `2026-10-18T12:00:${String(writes).padStart(2, '0')}Z` } as CheckIn
        entries = [...entries.filter(entry => entry.id !== id), saved]
        data = saved
      } else if (request.method() === 'DELETE') {
        if (failDelete) { await route.fulfill({ status: 503, json: { title: 'Could not remove your run. Try again.', status: 503 } }); return }
        entries = entries.filter(entry => entry.id !== id)
        await route.fulfill({ status: 204 }); return
      } else data = entries
    }
    await route.fulfill({ json: data })
  })
  return { entries: () => entries, writes: () => writes, failDelete: (value: boolean) => { failDelete = value } }
}

async function visitDay(page: Page, date: string) {
  await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
  const strip = page.getByRole('region', { name: 'Week 1 at a glance', exact: true })
  const button = strip.getByRole('button', { name: new RegExp(`^${formatDate(date, 'long')}:`) })
  await button.focus()
  await page.keyboard.press('Enter')
  const day = page.getByRole('region', { name: formatDate(date, 'long'), exact: true })
  await expect(day).toBeVisible()
  return { day, button }
}

test('rest-day imports open automatically, log once and survive navigation and cache deletion @phone', async ({ page }, info) => {
  const stored = await persistence(page)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  const { day, button } = await visitDay(page, '2026-10-14')
  const planned = day.getByRole('region', { name: 'Planned', exact: true })
  const recorded = day.getByRole('region', { name: 'Recorded', exact: true })
  await expect(planned).toContainText('Rest day')
  await expect(recorded.getByRole('article')).toHaveCount(1)
  await expect(recorded).toContainText('10 km')
  expect(stored.writes()).toBe(0)
  const close = day.getByRole('button', { name: 'Close day', exact: true })
  await expect(day.getByRole('heading', { name: formatDate('2026-10-14', 'long'), exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  expect(await day.evaluate(element => element.contains(document.activeElement))).toBe(false)
  await close.focus()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(button).toHaveAttribute('aria-controls', (await day.getAttribute('id'))!)
  expect(await day.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' && Number(animation.effect?.getComputedTiming().duration) > 1).length)).toBe(0)
  for (const width of [375, 820, 1440, 2560]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await day.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
    const box = await day.boundingBox()
    expect(box!.height).toBeLessThanOrEqual(385)
    expect(box!.width).toBeLessThanOrEqual(545)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)
  }
  await page.setViewportSize({ width: info.project.name === 'phone' ? 375 : 1440, height: 900 })
  await day.screenshot({ path: info.outputPath('calendar-day-before-log.png') })
  await recorded.getByRole('button', { name: 'Share run sticker', exact: true }).click()
  await expect(day.getByRole('img', { name: /Taperday sticker/ })).toBeVisible()
  await day.getByRole('button', { name: 'Close sticker', exact: true }).click()
  await recorded.getByRole('button', { name: 'Log this run', exact: true }).click()
  await expect(day.getByLabel('Run date')).toHaveValue('2026-10-14')
  await expect(day.getByLabel('Run details')).toHaveValue('synthetic-strava')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).dblclick()
  await expect(recorded.getByRole('article')).toHaveCount(1)
  await expect(recorded.getByRole('article')).toContainText('10 km · 1:06:40')
  expect(stored.entries()).toHaveLength(1)
  expect(stored.entries()[0]?.distanceKm).toBeNull()
  expect(stored.writes()).toBe(1)
  await page.keyboard.press('Escape')
  await expect(day).toHaveCount(0)
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-label', /activity recorded/)
  await page.getByRole('button', { name: 'Expire imported details', exact: true }).click()
  await button.click()
  await expect(recorded.getByRole('article')).toContainText('Imported activity is no longer available')
  await expect(recorded.getByRole('article')).toContainText('Distance not recorded')
  await expect(planned).toContainText('Rest day')
  await day.getByRole('button', { name: 'Close day', exact: true }).click()
  await page.getByRole('tab', { name: 'Calendar', exact: true }).click()
  const monthDay = page.getByRole('region', { name: 'Your plan by month', exact: true }).getByRole('button', { name: /^14 October:/ })
  await monthDay.click()
  await expect(recorded.getByRole('article')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(monthDay).toBeFocused()
  await page.reload()
  await visitDay(page, '2026-10-14')
  await expect(recorded.getByRole('article')).toHaveCount(1)
  expect(errors).toEqual([])
})

test('a replacement retains its original prescription beside the actual run @phone', async ({ page }, info) => {
  const stored = await persistence(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-13&km=10')
  const { day } = await visitDay(page, '2026-10-13')
  const planned = day.getByRole('region', { name: 'Planned', exact: true })
  const recorded = day.getByRole('region', { name: 'Recorded', exact: true })
  await expect(planned).toContainText('Hill repeats')
  await expect(planned).toContainText('5.5 km')
  await expect(planned.getByRole('checkbox', { name: 'Complete', exact: true })).not.toBeChecked()
  await recorded.getByRole('button', { name: 'Log this run', exact: true }).click()
  await day.getByLabel('How does this fit your plan?').selectOption('Hills')
  await day.getByLabel('What did you run?').selectOption('Easy')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await expect(planned.getByText('Completed', { exact: true })).toBeVisible()
  await expect(planned).toContainText('5.5 km')
  await expect(recorded.getByLabel('Completed run', { exact: true })).toHaveCount(1)
  await expect(recorded).toContainText('Easy run')
  await expect(recorded).toContainText('10 km · 1:06:40')
  expect(stored.entries()).toHaveLength(1)
  expect(stored.entries()[0]?.isAdditional).toBe(false)
  await day.screenshot({ path: info.outputPath('calendar-day-replacement.png') })
  await day.getByRole('button', { name: 'Change how Hill repeats went', exact: true }).click()
  await day.getByLabel('Run details').selectOption('')
  await day.getByLabel('Distance (km)', { exact: true }).fill('9')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await expect(recorded).toContainText('9 km')
  expect(stored.entries()).toHaveLength(1)
  await page.keyboard.press('Escape')
  await page.reload()
  await visitDay(page, '2026-10-13')
  await expect(recorded).toContainText('9 km')
  await expect(planned).toContainText('5.5 km')
})

test('manual time-only logs stay visible, retry failed deletion, and remove only when requested @phone', async ({ page }) => {
  const stored = await persistence(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&empty=1')
  const { day } = await visitDay(page, '2026-10-14')
  const recorded = day.getByRole('region', { name: 'Recorded', exact: true })
  await expect(recorded).toContainText('No activity recorded')
  await day.getByRole('button', { name: 'Log a run', exact: true }).click()
  await expect(day.getByLabel('Run date')).toHaveValue('2026-10-14')
  await day.getByLabel('Minutes', { exact: true }).fill('45')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await expect(recorded.getByRole('article')).toContainText('Distance not recorded · 45:00')
  await page.keyboard.press('Escape')
  await page.reload()
  await visitDay(page, '2026-10-14')
  await expect(recorded.getByRole('article')).toContainText('Distance not recorded · 45:00')
  await day.getByRole('button', { name: 'Change how Additional run went', exact: true }).click()
  await day.getByLabel('Distance (km)', { exact: true }).fill('8')
  await day.getByRole('button', { name: 'Save check-in', exact: true }).click()
  await expect(recorded.getByRole('article')).toContainText('8 km · 45:00')
  expect(stored.entries()).toHaveLength(1)
  stored.failDelete(true)
  await day.getByRole('button', { name: 'Change how Additional run went', exact: true }).click()
  await day.getByRole('button', { name: 'Remove check-in', exact: true }).click()
  await expect(day.getByRole('alert')).toBeVisible()
  await expect(recorded.getByRole('article')).toBeVisible()
  stored.failDelete(false)
  await day.getByRole('button', { name: 'Remove check-in', exact: true }).click()
  await expect(recorded.getByRole('article')).toHaveCount(0)
  await expect(recorded).toContainText('No activity recorded')
  expect(stored.entries()).toHaveLength(0)
})


test('calendar dropdown toggles and switches days without blocking the page @phone', async ({ page }) => {
  await persistence(page)
  await page.goto('http://127.0.0.1:5176/e2e/fixtures/run-history.html?date=2026-10-14&km=10')
  const url = page.url()
  const { day, button } = await visitDay(page, '2026-10-14')
  await button.click()
  await expect(day).toHaveCount(0)
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(button).toBeFocused()
  await button.click()
  await expect(day).toBeVisible()
  const tuesday = page.getByRole('region', { name: 'Week 1 at a glance', exact: true }).getByRole('button', { name: /^Tuesday 13 October 2026:/ })
  await tuesday.click()
  await expect(day).toHaveCount(0)
  const replacement = page.getByRole('region', { name: 'Tuesday 13 October 2026', exact: true })
  await expect(replacement).toContainText('Hill repeats')
  await expect(tuesday).toHaveAttribute('aria-expanded', 'true')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Escape')
  await expect(replacement).toHaveCount(0)
  await expect(tuesday).toBeFocused()
  await button.click()
  const allWeeks = page.getByRole('tab', { name: 'Calendar', exact: true })
  await allWeeks.click()
  await expect(day).toHaveCount(0)
  await expect(allWeeks).toBeFocused()
  const month = page.getByRole('region', { name: 'Your plan by month', exact: true })
  const wednesday = month.getByRole('button', { name: /^14 October:/ })
  await wednesday.click()
  await expect(day).toBeVisible()
  await month.getByRole('button', { name: 'Next month', exact: true }).click()
  await expect(day).toHaveCount(0)
  await expect(month.getByRole('heading', { name: 'November 2026', exact: true })).toBeVisible()
  expect(page.url()).toBe(url)
})
