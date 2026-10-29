import type { Page } from '@playwright/test'
import { formatDate } from '../src/lib/format'

export async function openDisclosure(page: Page, label: string | RegExp) {
  const summary = page.locator('summary').filter({ hasText: typeof label === 'string' ? new RegExp(`^${label}$`) : label })
  await summary.waitFor({ state: 'visible' })
  if (!await summary.evaluate(element => element.closest('details')!.open)) await summary.click()
  return summary.locator('..')
}

export const openPlanOptions = (page: Page) => openDisclosure(page, 'Plan options')
export async function openStrengthWorkouts(page: Page) {
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  return openDisclosure(page, 'Strength workouts')
}

export async function openRecentRun(page: Page, date: string) {
  const summaries = page.locator('.activity-row > summary').filter({ hasText: formatDate(date) })
  await summaries.first().waitFor({ state: 'visible' })
  for (const summary of await summaries.all()) if (!await summary.evaluate(element => element.closest('details')!.open)) await summary.click()
}

export const openSyncedRuns = (page: Page) => openDisclosure(page, /^\d+ synced /)
