import { openStrengthWorkouts, openWeekDay } from '../../test/user-navigation'
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PlanView } from '../plan/PlanView'
import { planFixture } from '../../test/server'
import { StrengthTab } from './StrengthTab'

function Strength() {
  const [done, setDone] = useState(new Set<string>())
  return <StrengthTab plan={planFixture} week={planFixture.weeks[0]} done={done} onDoneChange={update => setDone(current => update(current))} />
}

describe('compact strength workouts', () => {
  it('hides exercises until opened, preserves set progress after closing and reopening', async () => {
    const user = userEvent.setup()
    const { container } = render(<Strength />)
    const card = container.querySelector('details.strength-session')!
    expect(card).not.toHaveAttribute('open')
    within(card as HTMLElement).getAllByRole('checkbox').forEach(box => expect(box).not.toBeVisible())
    const summary = card.querySelector('summary')!
    await user.click(summary)
    expect(card).toHaveAttribute('open')
    const firstSet = within(card as HTMLElement).getByRole('checkbox', { name: /Squat, set 1 of/ })
    await user.click(firstSet)
    expect(firstSet).toBeChecked()
    await user.click(summary)
    expect(card).not.toHaveAttribute('open')
    expect(summary).toHaveTextContent('1/18 sets done')
    within(card as HTMLElement).getAllByRole('checkbox').forEach(box => expect(box).not.toBeVisible())
    await user.click(summary)
    expect(within(card as HTMLElement).getByRole('checkbox', { name: /Squat, set 1 of/ })).toBeChecked()
  })

  it('keeps run details free of strength controls while tracking sets in Strength', async () => {
    const user = userEvent.setup()
    const { container } = render(<PlanView plan={planFixture} units="km" today="2026-10-18" shareUrl="https://example.test" />)
    const week = screen.getByRole('tabpanel', { name: 'This week' })
    expect(within(week).queryByRole('checkbox', { name: /Squat, set/ })).not.toBeInTheDocument()
    const day = await openWeekDay('2026-10-12')
    expect(within(day).getByRole('region', { name: 'Strength' })).toHaveTextContent('6 exercises')
    expect(within(day).queryByRole('checkbox', { name: /Squat, set/ })).not.toBeInTheDocument()
    await user.click(within(day).getByRole('button', { name: 'Open strength workouts' }))
    const panel = await openStrengthWorkouts()
    const summary = container.querySelector('.strength-session > summary')!
    expect(summary.closest('details')).not.toHaveAttribute('open')
    await user.click(summary)
    const first = within(panel).getByRole('checkbox', { name: /Squat, set 1 of/ })
    await user.click(first)
    expect(first).toBeChecked()
    await user.click(summary)
    expect(summary).toHaveTextContent('1/18 sets done')
  })
})
