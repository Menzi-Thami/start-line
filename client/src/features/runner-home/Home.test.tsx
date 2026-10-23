import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, PersonalBest, Runner } from '../../lib/types'
import { Home } from './Home'

const thandi = { id: 'runner-1', displayName: 'Thandi', maxHeartRate: 190 } as Runner

const run = (localDate: string, distanceKm: number, source: 'Upload' | 'Strava' = 'Upload'): ActivitySummary =>
  ({
    id: `${localDate}`,
    startedAt: `${localDate}T06:00:00Z`,
    localDate,
    kind: 'Run',
    distanceKm,
    movingSeconds: distanceKm * 360,
    paceSecondsPerKm: 360,
    plannedTitle: null,
    plannedSessionType: null,
    pace: null,
    averageHeartRate: null,
    source: { kind: source, viewUrl: null },
  }) as unknown as ActivitySummary

const tenK: PersonalBest = { name: '10K', distanceMetres: 10000, seconds: 3258, paceSecondsPerKm: 325.8, localDate: '2026-10-18', activityId: 'nelson' } as PersonalBest

const renderHome = (props: Partial<Parameters<typeof Home>[0]> = {}) => {
  const handlers = { onOpenPlan: vi.fn(), onBuildPlan: vi.fn(), onOpenRuns: vi.fn(), onOpenRun: vi.fn(), onOpenAccount: vi.fn() }
  render(<Home runner={thandi} units="km" today="2026-10-23" current={null} runs={[]} {...handlers} {...props} />)
  return { ...handlers, user: userEvent.setup() }
}

describe('Home', () => {
  it('greets the runner and, without a plan, offers to build one', async () => {
    const { user, onBuildPlan } = renderHome()

    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onBuildPlan).toHaveBeenCalled()
  })

  it('shows their running this month, this year and week by week, from their own runs', () => {
    renderHome({ runs: [run('2026-10-18', 42.2), run('2026-10-02', 10), run('2026-09-05', 12)] })

    const running = screen.getByRole('region', { name: 'Your running' })
    expect(within(running).getByText('52.2')).toBeInTheDocument()
    expect(within(running).getByText('64.2')).toBeInTheDocument()
    expect(within(running).getByText(/40.2 km \(335%\) more than 1 Sept–23 Sept/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Weekly distance, last 12 weeks' })).toBeInTheDocument()
  })

  it('says plainly that Strava runs only stay for a week', () => {
    renderHome({ runs: [run('2026-10-21', 8, 'Strava')] })

    expect(screen.getByText(/Runs from Strava stay on Taperday for 7 days/)).toBeInTheDocument()
  })

  it('shows personal bests, each opening the run it came from', async () => {
    const { user, onOpenRun } = renderHome({ bests: [tenK] })

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(bests).getByText('54:18')).toBeInTheDocument()
    await user.click(within(bests).getByRole('button', { name: '18 Oct' }))
    expect(onOpenRun).toHaveBeenCalledWith('nelson')
  })

  it('is honest about which connections exist today and which are coming', () => {
    renderHome()

    const connections = screen.getByRole('region', { name: 'Your runs, from anywhere' })
    expect(within(connections).getByText(/Upload a .fit, .gpx or .tcx file/)).toBeInTheDocument()
    expect(within(connections).getByText(/Coming with the Taperday phone app/)).toBeInTheDocument()
  })
})

describe('the calculators', () => {
  it('turns a distance and a time into a pace, and a pace into a finish time', async () => {
    const { user } = renderHome()
    const calculators = screen.getByRole('region', { name: 'Calculators' })

    const time = within(calculators).getByRole('group', { name: 'Your time' })
    const pace = within(calculators).getByRole('group', { name: 'Or a pace (per km)' })
    await user.type(within(time).getByLabelText('Minutes'), '50')
    expect(within(calculators).getByText('5:00/km')).toBeInTheDocument()

    await user.type(within(pace).getByLabelText('Minutes'), '6')
    expect(within(calculators).getByText('1:00:00')).toBeInTheDocument()
  })

  it('predicts race times from a recent race', async () => {
    const { user } = renderHome()
    await user.click(screen.getByRole('button', { name: 'Race times' }))

    await user.type(screen.getByLabelText('Minutes'), '24')
    await user.click(screen.getByRole('button', { name: 'Predict my race times' }))

    const table = await within(screen.getByRole('region', { name: 'Calculators' })).findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('lists heart-rate zones from the runner’s own maximum', async () => {
    const { user } = renderHome()
    await user.click(screen.getByRole('button', { name: 'Heart rate' }))

    expect(screen.getByLabelText('Your maximum heart rate (bpm)')).toHaveValue('190')
    expect(screen.getByText('Zone 2: Easy')).toBeInTheDocument()
    expect(screen.getByText('114–133 bpm')).toBeInTheDocument()
  })

  it('splits a goal by the kilometre, and says what to eat for a long race', async () => {
    const { user } = renderHome()
    await user.click(screen.getByRole('button', { name: 'Splits' }))
    await user.type(screen.getByLabelText('Minutes'), '50')
    const splitRows = within(within(screen.getByRole('region', { name: 'Calculators' })).getByRole('table')).getAllByRole('row').slice(1)
    expect(splitRows).toHaveLength(10)
    expect(splitRows.every((row) => within(row).getAllByRole('cell')[0]!.textContent === '5:00')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Fuelling' }))
    await user.type(screen.getByLabelText('Hours'), '4')
    expect(screen.getByText(/60–90 g/)).toBeInTheDocument()
  })
})
