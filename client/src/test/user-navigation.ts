import { formatDate } from '../lib/format'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

export async function openDisclosure(label: string | RegExp) {
  const summary = await screen.findByText(label, { selector: 'summary', exact: true }, { timeout: 10000 })
  // Open containing disclosures before operating their actual controls.
  const closed: HTMLDetailsElement[] = []
  for (let details = summary.parentElement?.parentElement?.closest('details'); details; details = details.parentElement?.closest('details')) if (!details.open) closed.unshift(details)
  for (const details of closed) await userEvent.setup().click(details.querySelector<HTMLElement>(':scope > summary')!)
  if (!summary.closest('details')?.open) await userEvent.setup().click(summary)
  return summary.closest('details')!
}

/** The plan's tools row (Share link, Add to calendar, Export to watch, Save or Delete) is always in view. */
export async function findPlanControl(name: string) {
  await closePlanDay()
  return screen.findByRole('button', { name }, { timeout: 10000 })
}

/** "Change my plan" › Rebuild from today: the one door for every change to the plan. */
export async function openRebuild() {
  await closePlanDay()
  await openDisclosure('Change my plan')
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Rebuild from today' }))
}

export async function openStrengthWorkouts() {
  await closePlanDay()
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Strength' }))
  return screen.getByRole('tabpanel', { name: 'Strength' })
}

export async function openTrainingGuide(label: 'Training paces' | 'Running insights') {
  await userEvent.setup().click(screen.getByRole('tab', { name: 'Progress' }))
  return openDisclosure(label)
}

export async function openWeekDay(date: string) {
  await closePlanDay()
  const name = formatDate(date, 'long')
  await userEvent.setup().click(await screen.findByRole('button', { name: new RegExp(`^${name}:`) }, { timeout: 10000 }))
  await userEvent.setup().click(await screen.findByRole('button', { name: /Open day details/ }))
  return screen.findByRole('region', { name }, { timeout: 10000 })
}

export async function closePlanDay() {
  const back = screen.queryByRole('button', { name: /Back to plan/ })
  if (back) { await userEvent.setup().click(back); await waitFor(() => { if (new URLSearchParams(window.location.search).has('day')) throw new Error('Waiting for back navigation') }) }
}
