import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { TrainingPlan } from '../../lib/types'
import fixture from '../../test/fixtures/plan-5k.json'
import { PreparationGuide } from './PreparationGuide'

const plan = fixture as TrainingPlan

describe('preparation guide', () => {
  it('finishes at the chosen goal time and handles a partial final checkpoint', () => {
    render(<PreparationGuide plan={{ ...plan, race: { ...plan.race, distanceKm: 21.1 }, goalTime: '02:00:00' }} units="km" mode="race" date={null} />)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(6)
    expect(within(rows[1]!).getByRole('cell')).toHaveTextContent('28:26')
    expect(within(rows.at(-1)!).getByRole('rowheader')).toHaveTextContent('21.1 km · Finish')
    expect(within(rows.at(-1)!).getByRole('cell')).toHaveTextContent('2:00:00')
    expect(screen.getByText(/Hills, conditions and how you feel/)).toBeInTheDocument()
  })

  it('uses the prescribed long run for the linked date and shows preparation without a race-pace table', () => {
    const longRun = plan.weeks.flatMap(w => w.sessions).find(s => s.type.startsWith('LongRun'))!
    render(<PreparationGuide plan={plan} units="mi" mode="long" date={longRun.date} />)
    expect(screen.getByRole('heading', { name: `Prepare for ${longRun.title.toLowerCase()}` })).toBeInTheDocument()
    expect(screen.getByText(longRun.detail)).toBeInTheDocument()
    expect(screen.getByText(/Plan access to water/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('does not invent checkpoints when a goal is unavailable', () => {
    render(<PreparationGuide plan={{ ...plan, goalTime: '00:00:00' }} units="km" mode="race" date={null} />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByText(/organiser’s start time/)).toBeInTheDocument()
  })
})
