import type { Page } from '@playwright/test'
import { formatDate } from '../src/lib/format'

export async function openDisclosure(page: Page, label: string | RegExp) {
  const summary = page.locator('summary').filter({ hasText: typeof label === 'string' ? new RegExp(`^${label}$`) : label })
  if (!await summary.count() && /Running (insights|tools)|synced/.test(String(label))) await openHomeLibrary(page, String(label).includes('tools') ? 'tools' : 'insights')
  await summary.waitFor({ state: 'attached' })
  // Open a containing disclosure before operating its actual visible control.
  await summary.evaluate(element => {
    const closed: HTMLDetailsElement[] = []
    for (let details = element.parentElement?.parentElement?.closest('details'); details; details = details.parentElement?.closest('details')) if (!details.open) closed.unshift(details)
    for (const details of closed) details.querySelector<HTMLElement>(':scope > summary')!.click()
  })
  await summary.waitFor({ state: 'visible' })
  if (!await summary.evaluate(element => element.closest('details')!.open)) await summary.click()
  return summary.locator('..')
}

export const openPlanOptions = (page: Page) => openDisclosure(page, 'Plan options')
export async function openHomeLibrary(page: Page, section: 'insights' | 'tools' | 'review' = 'insights') {
  const main = page.getByRole('navigation', { name: 'Main', exact: true })
  if (await main.count() && section !== 'review') {
    await main.getByRole('button', { name: 'Runs', exact: true }).click()
    await page.getByRole('button', { name: section === 'tools' ? 'Running tools' : 'Running insights', exact: true }).click()
  } else {
    // Isolated Home fixtures and the supported legacy review bookmark use the same URL contract.
    await page.evaluate(value => {
      const url = new URL(location.href)
      url.searchParams.set('view', 'home')
      if (value === 'review') url.searchParams.set('review', '1')
      else url.searchParams.set('tab', value)
      history.pushState(null, '', url)
      dispatchEvent(new PopStateEvent('popstate'))
    }, section)
  }
  await page.getByRole('button', { name: /^← Back to (Home|Runs)$/ }).waitFor({ state: 'visible' })
  return page.locator('.home-library')
}
export async function openStrengthWorkouts(page: Page) {
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  return openDisclosure(page, 'Strength workouts')
}

export async function openRecentRun(page: Page, date: string) {
  const summaries = page.locator('.activity-row > summary').filter({ hasText: formatDate(date) })
  if (!await summaries.count()) await openHomeLibrary(page)
  await summaries.first().waitFor({ state: 'attached' })
  await summaries.first().waitFor({ state: 'visible' })
  for (const summary of await summaries.all()) if (!await summary.evaluate(element => element.closest('details')!.open)) await summary.click()
}

export const openSyncedRuns = (page: Page) => openDisclosure(page, /^\d+ synced /)
