import { openWeekDay } from '../../test/user-navigation'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Units } from '../../lib/format'
import type { ActivitySummary, TrainingPlan } from '../../lib/types'
import plan5k from '../../test/fixtures/plan-5k.json'
import { UPLOADED } from '../../test/sources'
import { PlanView } from './PlanView'

// A 5K plan from Monday 12 October to race day on Sunday 13 December 2026. Week 1 plans 17.5 km of running:
// strength on Monday, hills on Tuesday, nothing on Wednesday, a long run on Sunday.
const plan = plan5k as TrainingPlan

function run(id: string, localDate: string, distanceKm: number, time = '07:00'): ActivitySummary {
  return { id, startedAt: `${localDate}T${time}:00Z`, localDate, kind: 'Run', distanceKm, movingSeconds: distanceKm * 360, paceSecondsPerKm: 360, plannedTitle: null, plannedSessionType: null, pace: null, averageHeartRate: null, source: UPLOADED }
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

    let day = await openWeekDay('2026-10-13')
    const hills = within(day).getByRole('article', { name: 'Recorded run: 5.6 km' })
    await userEvent.click(within(hills).getByRole('button', { name: 'View run' }))
    expect(onOpenRun).toHaveBeenCalledWith('hills')

    // Both runs on the same day remain distinct, in their original order.
    day = await openWeekDay('2026-10-18')
    const sunday = within(day).getAllByRole('article', { name: /^Recorded run:/ })
    expect(sunday.map(card => card.getAttribute('aria-label'))).toEqual(['Recorded run: 6.2 km', 'Recorded run: 2 km'])
  })

  it('shows running on rest and strength days without completing their prescriptions', async () => {
    show({ today: '2026-10-18', runs, onOpenRun: () => {} })
    let day = await openWeekDay('2026-10-14')
    expect(within(day).getByRole('article', { name: 'Recorded run: 4 km' })).toBeVisible()
    expect(within(day).getByRole('region', { name: 'Planned' })).toHaveTextContent('Rest day')
    day = await openWeekDay('2026-10-12')
    expect(within(day).getByRole('article', { name: 'Recorded run: 3 km' })).toBeVisible()
    expect(within(day).getByRole('region', { name: 'Planned' })).toHaveTextContent('No completion recorded')
  })

  it('shows recorded measurements in the runner’s units without an unavailable open action', async () => {
    show({ today: '2026-10-18', runs, units: 'mi' })
    expect(screen.queryByRole('button', { name: /open your run/i })).not.toBeInTheDocument()
    let day = await openWeekDay('2026-10-13')
    expect(within(day).getByRole('article', { name: 'Recorded run: 3.5 mi' })).toBeVisible()
    expect(within(day).queryByRole('button', { name: 'View run' })).not.toBeInTheDocument()
    day = await openWeekDay('2026-10-14')
    expect(within(day).getByRole('article', { name: 'Recorded run: 2.5 mi' })).toBeVisible()
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
