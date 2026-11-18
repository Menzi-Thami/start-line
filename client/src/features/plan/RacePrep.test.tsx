import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { TrainingPlan } from '../../lib/types'
import { planFixture } from '../../test/server'
import { RacePrep } from './RacePrep'

// The fixture's race is a 5K on Sunday 13 December, goal 24:30.
const plan = planFixture
const half: TrainingPlan = { ...plan, race: { ...plan.race, distanceKm: 21.1 }, goalTime: '02:00:00' }

describe('race prep', () => {
  it('shows only in race week, and never before it or after the race', () => {
    const { rerender, container } = render(<RacePrep plan={plan} today="2026-12-05" units="km" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RacePrep plan={plan} today="2026-12-14" units="km" />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RacePrep plan={plan} today="2026-12-06" units="km" />)
    expect(screen.getByRole('heading', { name: 'Prepare for Parkrun PB' })).toBeInTheDocument()
    expect(screen.getByText('Race week · 7 days to go')).toBeInTheDocument()
  })

  it('gives even-pace checkpoints for the goal, ending at the finish', () => {
    render(<RacePrep plan={half} today="2026-12-12" units="km" />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1).map(row => row.textContent)
    expect(rows).toEqual(['5 km28:26', '10 km56:52', '15 km1:25:18', '20 km1:53:45', '21.1 km · Finish2:00:00'])
  })

  it('leaves the checkpoints out without a goal time', () => {
    render(<RacePrep plan={{ ...plan, goalTime: '00:00:00' }} today="2026-12-12" units="km" />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('becomes the race-day card on the day, and keeps the checklist on this device', async () => {
    const { unmount } = render(<RacePrep plan={plan} today="2026-12-13" units="km" />)
    expect(screen.getByRole('heading', { name: 'It’s race day.' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('checkbox')[0]!)
    expect(screen.getByText('1 of 6 ready · saved on this device.')).toBeInTheDocument()
    unmount()
    render(<RacePrep plan={plan} today="2026-12-13" units="km" />)
    expect(screen.getAllByRole('checkbox')[0]).toBeChecked()
  })
})
