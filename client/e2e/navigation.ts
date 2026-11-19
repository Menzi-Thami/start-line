import type { Page } from '@playwright/test'
import { formatDate } from '../src/lib/format'

export async function openDisclosure(page: Page, label: string | RegExp) {
  const summary = page.locator('summary').filter({ hasText: typeof label === 'string' ? new RegExp(`^${label}$`) : label })
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

export async function openStrengthWorkouts(page: Page) {
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  return openDisclosure(page, 'Strength workouts')
}

/** The running totals now live on Runs; the run-history harness shows the real totals there. */
export async function openRunningTotals(page: Page) {
  await page.getByRole('button', { name: 'Visit runs', exact: true }).click()
  return page.getByRole('region', { name: 'Your running totals', exact: true })
}

/** Synced and saved runs are logged and edited on their own day in the plan. */
export async function openRunDay(page: Page, date: string) {
  await page.getByRole('button', { name: 'Visit calendar', exact: true }).click()
  // The plan may reopen on the day it was left on; step back to this week first.
  const back = page.getByRole('button', { name: /Back to plan/ })
  const week = page.getByRole('tab', { name: 'This week', exact: true })
  await back.or(week).first().waitFor()
  if (await back.count()) await back.click()
  await page.getByRole('tab', { name: 'This week', exact: true }).click()
  const name = formatDate(date, 'long')
  await page.getByRole('button', { name: new RegExp(`^${name}:`) }).click()
  await page.getByRole('button', { name: /Open day details/ }).click()
  return page.getByRole('region', { name, exact: true })
}
