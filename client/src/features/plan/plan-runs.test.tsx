import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Units } from '../../lib/format'
import type { ActivitySummary, TrainingPlan } from '../../lib/types'
import plan5k from '../../test/fixtures/plan-5k.json'
import { PlanView } from './PlanView'

// A 5K plan from Monday 12 October to race day on Sunday 13 December 2026. Week 1 plans 17.5 km of running:
// strength on Monday, hills on Tuesday, nothing on Wednesday, a long run on Sunday.
const plan = plan5k as TrainingPlan

function run(id: string, localDate: string, distanceKm: number, time = '07:00'): ActivitySummary {
  return { id, startedAt: `${localDate}T${time}:00Z`, localDate, kind: 'Run', distanceKm, movingSeconds: distanceKm * 360, paceSecondsPerKm: 360, plannedTitle: null }
}

const runs = [
  run('hills', '2026-10-13', 5.6),
  run('rest-day', '2026-10-14', 4),
  run('strength-day', '2026-10-12', 3),
  run('long-am', '2026-10-18', 6.2, '06:30'),
  run('long-pm', '2026-10-18', 2, '17:00'),
]

function show(props: { today: string; runs?: ActivitySummary[]; onOpenRun?: (id: string) => void; units?: Units }) {
  const { units = 'km', ...rest } = props
  return render(<PlanView plan={plan} units={units} onUnitsChange={() => {}} shareUrl="https://taperday.run/?x" {...rest} />)
}

describe('the plan beside what was run', () => {
  it('looks the same as ever without runs', async () => {
    show({ today: '2026-10-18' })
    expect(screen.queryByText(/^Ran /)).not.toBeInTheDocument()
    expect(screen.queryByText(/Unplanned run/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open your run/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Progress' }))
    expect(screen.queryByRole('heading', { name: 'What you ran' })).not.toBeInTheDocument()
    expect(screen.queryByText('Ran', { selector: 'th' })).not.toBeInTheDocument()
  })

  it('marks planned runs done with the distance, and each opens its run', async () => {
    const onOpenRun = vi.fn()
    show({ today: '2026-10-18', runs, onOpenRun })

    const hills = screen.getByRole('button', { name: 'Open your run on Tuesday 13 October: Ran 5.6 km' })
    await userEvent.click(hills)
    expect(onOpenRun).toHaveBeenCalledWith('hills')

    // Two runs on the long-run day: one mark each, in the order they were run.
    const sunday = screen.getAllByRole('button', { name: /Open your run on Sunday 18 October/ })
    expect(sunday.map((b) => b.textContent)).toEqual(['Ran 6.2 km', 'Ran 2 km'])
  })

  it('shows runs on days without a planned run as unplanned, strength days included', () => {
    show({ today: '2026-10-18', runs, onOpenRun: () => {} })
    expect(screen.getByRole('button', { name: 'Open your run on Wednesday 14 October: Unplanned run · 4 km' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open your run on Monday 12 October: Unplanned run · 3 km' })).toBeInTheDocument()
  })

  it('shows the marks as plain text, in the runner’s units, when runs can’t be opened', () => {
    show({ today: '2026-10-18', runs, units: 'mi' })
    expect(screen.queryByRole('button', { name: /open your run/i })).not.toBeInTheDocument()
    const thisWeek = screen.getByRole('tabpanel', { name: 'This week' })
    expect(within(thisWeek).getByText('Ran 3.5 mi')).toBeInTheDocument()
    expect(within(thisWeek).getByText('Unplanned run · 2.5 mi')).toBeInTheDocument()
  })

  it('puts kilometres run beside the plan for every week so far, in words', async () => {
    show({ today: '2026-10-21', runs: [...runs, run('fartlek', '2026-10-20', 6.5)] })
    await userEvent.click(screen.getByRole('tab', { name: 'Progress' }))

    const panel = screen.getByRole('tabpanel', { name: 'Progress' })
    const totals = within(panel).getAllByRole('listitem').filter((li) => li.classList.contains('week-total'))
    expect(totals.map((li) => li.textContent)).toEqual(['Week 1Ran 20.8 of 17.5 km', 'Week 2Ran 6.5 of 23.5 km so far'])
    expect(within(panel).queryByText(/more than planned/i)).not.toBeInTheDocument()
    expect(within(panel).getByText('Ran', { selector: 'th' })).toBeInTheDocument()
  })

  it('says a calm word about a week well over the plan, and nothing about a short one', async () => {
    show({ today: '2026-10-25', runs: [run('big', '2026-10-13', 30), run('short', '2026-10-20', 5)] })
    await userEvent.click(screen.getByRole('tab', { name: 'Progress' }))

    const panel = screen.getByRole('tabpanel', { name: 'Progress' })
    expect(within(panel).getByText('Ran 30 of 17.5 km')).toBeInTheDocument()
    expect(within(panel).getByText('Ran 5 of 23.5 km so far')).toBeInTheDocument()
    expect(within(panel).getAllByText(/more than planned/i)).toHaveLength(1)
  })
})
