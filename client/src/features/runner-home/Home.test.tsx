import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActivitySummary, PersonalBest, Runner } from '../../lib/types'
import { stravaOff } from '../../test/server'
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
  const handlers = { onOpenPlan: vi.fn(), onBuildPlan: vi.fn(), onOpenRun: vi.fn(), onOpenAccount: vi.fn() }
  render(<Home runner={thandi} units="km" today="2026-10-23" current={null} runs={[]} {...handlers} {...props} />)
  const user = userEvent.setup()
  return { ...handlers, user, openTab: (name: 'Today' | 'Progress' | 'Tools') => user.click(screen.getByRole('tab', { name })) }
}

beforeEach(() => window.history.replaceState(null, '', '/?view=home'))

describe('Home', () => {
  it('greets the runner and, without a plan, offers to build one', async () => {
    const { user, onBuildPlan } = renderHome()

    expect(screen.getByRole('heading', { name: 'Welcome back, Thandi' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onBuildPlan).toHaveBeenCalled()
  })

  it('opens on Today, with their running and the calculators a tab away', async () => {
    const { openTab } = renderHome()

    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'This week' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Your running' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Calculators' })).not.toBeInTheDocument()

    await openTab('Tools')
    expect(screen.getByRole('region', { name: 'Calculators' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'This week' })).not.toBeInTheDocument()
  })

  it('keeps the tab in the address, so a shared link or Back opens the same one', async () => {
    const { openTab } = renderHome()

    await openTab('Progress')
    expect(window.location.search).toBe('?view=home&tab=progress')
    await openTab('Today')
    expect(window.location.search).toBe('?view=home')
  })

  it('opens on the tab the address names', () => {
    window.history.replaceState(null, '', '/?view=home&tab=tools')
    renderHome()

    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Calculators' })).toBeInTheDocument()
  })

  it('moves between tabs with the arrow keys, like any tab list', async () => {
    const { user } = renderHome()

    await user.click(screen.getByRole('tab', { name: 'Today' }))
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Progress' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(screen.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows their running this month, this year and week by week, from their own runs', async () => {
    const { openTab } = renderHome({ runs: [run('2026-10-18', 42.2), run('2026-10-02', 10), run('2026-09-05', 12)] })
    await openTab('Progress')

    const running = screen.getByRole('region', { name: 'Your running' })
    expect(within(running).getByText('52.2')).toBeInTheDocument()
    expect(within(running).getByText('64.2')).toBeInTheDocument()
    expect(within(running).getByText(/40.2 km \(335%\) more than 1 Sept–23 Sept/)).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Weekly distance, last 12 weeks' })).toBeInTheDocument()
  })

  it('says plainly that Strava runs only stay for a week', async () => {
    const { openTab } = renderHome({ runs: [run('2026-10-21', 8, 'Strava')] })
    await openTab('Progress')

    expect(screen.getByText(/Runs from Strava stay on Taperday for 7 days/)).toBeInTheDocument()
  })

  it('shows personal bests, each opening the run it came from', async () => {
    const { user, onOpenRun, openTab } = renderHome({ bests: [tenK] })
    await openTab('Progress')

    const bests = screen.getByRole('region', { name: 'Personal bests' })
    expect(within(bests).getByText('54:18')).toBeInTheDocument()
    await user.click(within(bests).getByRole('button', { name: '18 Oct' }))
    expect(onOpenRun).toHaveBeenCalledWith('nelson')
  })

  it('nudges once to connect Strava when it could send runs, and says nothing when it does', async () => {
    const { user, onOpenAccount } = renderHome({ strava: { ...stravaOff, available: true } })

    await user.click(screen.getByRole('button', { name: 'Connect Strava' }))
    expect(onOpenAccount).toHaveBeenCalled()
  })

  it('leaves Strava out of Home once it’s connected, or when it isn’t on offer', () => {
    renderHome({ strava: { ...stravaOff, available: true, connected: true, status: 'Active' } })
    expect(screen.queryByText(/Strava/)).not.toBeInTheDocument()
  })
})

describe('the calculators', () => {
  it('turns a distance and a time into a pace, and a pace into a finish time', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    const calculators = screen.getByRole('region', { name: 'Calculators' })

    const time = within(calculators).getByRole('group', { name: 'Your time' })
    const pace = within(calculators).getByRole('group', { name: 'Or a pace (per km)' })
    await user.type(within(time).getByLabelText('Minutes'), '50')
    expect(within(calculators).getByText('5:00/km')).toBeInTheDocument()

    await user.type(within(pace).getByLabelText('Minutes'), '6')
    expect(within(calculators).getByText('1:00:00')).toBeInTheDocument()
  })

  it('predicts race times from a recent race', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    await user.click(screen.getByRole('button', { name: 'Race times' }))

    await user.type(screen.getByLabelText('Minutes'), '24')
    await user.click(screen.getByRole('button', { name: 'Predict my race times' }))

    const table = await within(screen.getByRole('region', { name: 'Calculators' })).findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('lists heart-rate zones from the runner’s own maximum', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
    await user.click(screen.getByRole('button', { name: 'Heart rate' }))

    expect(screen.getByLabelText('Your maximum heart rate (bpm)')).toHaveValue('190')
    expect(screen.getByText('Zone 2: Easy')).toBeInTheDocument()
    expect(screen.getByText('114–133 bpm')).toBeInTheDocument()
  })

  it('splits a goal by the kilometre, and says what to eat for a long race', async () => {
    const { user, openTab } = renderHome()
    await openTab('Tools')
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
