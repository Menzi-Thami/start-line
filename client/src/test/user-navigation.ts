import { formatDate } from '../lib/format'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Follow the same disclosure controls a runner uses, rather than querying hidden actions. */
export async function openDisclosure(label: string | RegExp) {
  const summary = await screen.findByText(label, { selector: 'summary', exact: true }, { timeout: 10000 })
  // Home and Plan keep their extras behind one row ("Coaching, insights and tools", "Plan tools"): open those first.
  const closed: HTMLDetailsElement[] = []
  for (let details = summary.parentElement?.parentElement?.closest('details'); details; details = details.parentElement?.closest('details')) if (!details.open) closed.unshift(details)
  for (const details of closed) await userEvent.setup().click(details.querySelector<HTMLElement>(':scope > summary')!)
  if (!summary.closest('details')?.open) await userEvent.setup().click(summary)
  return summary.closest('details')!
}

export async function findPlanControl(name: string) {
  await openDisclosure('Plan options')
  return screen.findByRole('button', { name }, { timeout: 10000 })
}

export async function openStrengthWorkouts() {
  await closePlanDay()
  await userEvent.setup().click(screen.getByRole('tab', { name: 'This week' }))
  return openDisclosure('Strength workouts')
}

export async function openTrainingGuide(label: 'Training paces' | 'Running insights') {
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Progress' }))
  return openDisclosure(label)
}

export async function openWeekDay(date: string) {
  await closePlanDay()
  const name = formatDate(date, 'long')
  await userEvent.setup().click(await screen.findByRole('button', { name: new RegExp(`^${name}:`) }))
  await userEvent.setup().click(await screen.findByRole('button', { name: /Open day details/ }))
  return screen.findByRole('region', { name }, { timeout: 10000 })
}

export async function openRecentRun(date: string) {
  const summaries = await screen.findAllByText(formatDate(date), { selector: '.activity-row > summary > span:first-child' })
  for (const summary of summaries) if (!summary.closest('details')?.open) await userEvent.setup().click(summary.closest('summary')!)
}

export async function closePlanDay() {
  const back = screen.queryByRole('button', { name: /Back to plan/ })
  if (back) { await userEvent.setup().click(back); await waitFor(() => { if (new URLSearchParams(window.location.search).has('day')) throw new Error('Waiting for back navigation') }) }
}
