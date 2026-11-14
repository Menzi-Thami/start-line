import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

const plan = JSON.parse(readFileSync(new URL('../src/test/fixtures/plan-5k.json', import.meta.url), 'utf8'))

test.use({ baseURL: 'http://127.0.0.1:5176' })

test('a malformed Journey reply leaves Home, existing workouts and calendar usable @phone', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const data = path.endsWith('/coach') ? { id: 'visibility-plan', plan, coaching: [] }
      : path.endsWith('/journey') ? [] // Older fixtures and accidental API shape mismatches must fail gracefully.
        : []
    return route.fulfill({ json: data })
  })
  await page.goto('/e2e/fixtures/run-history.html?date=2026-10-14')
  await expect(page.getByRole('button', { name: 'Visit calendar' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Visit calendar' }).click()
  await expect(page.getByRole('tab', { name: 'This week', exact: true })).toBeVisible()
  expect(pageErrors).toEqual([])
})
