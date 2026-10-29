import { formatDate } from '../lib/format'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

/** Follow the same disclosure controls a runner uses, rather than querying hidden actions. */
export async function openDisclosure(label: string | RegExp) {
  const summary = await screen.findByText(label, { selector: 'summary', exact: true })
  if (!summary.closest('details')?.open) await userEvent.setup().click(summary)
  return summary.closest('details')!
}

export async function findPlanControl(name: string) {
  await openDisclosure('Plan options')
  return screen.findByRole('button', { name })
}

export async function openStrengthWorkouts() {
  await userEvent.setup().click(screen.getByRole('tab', { name: 'This week' }))
  return openDisclosure('Strength workouts')
}

export async function openTrainingGuide(label: 'Training paces' | 'Running insights') {
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Progress' }))
  return openDisclosure(label)
}

export async function openWeekDay(date: string) {
  const name = formatDate(date, 'long')
  await userEvent.setup().click(await screen.findByRole('button', { name: new RegExp(`^${name}:`) }))
  return screen.findByRole('region', { name })
}

export async function openRecentRun(date: string) {
  const summaries = await screen.findAllByText(formatDate(date), { selector: '.activity-row > summary > span:first-child' })
  for (const summary of summaries) if (!summary.closest('details')?.open) await userEvent.setup().click(summary.closest('summary')!)
}
