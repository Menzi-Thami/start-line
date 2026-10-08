import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lastPlanRequest, server } from '../test/server'
import { App } from './App'

// The plan fixture was built from 8 October 2026, so "today" is pinned there.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 8, 9, 0))
})

afterEach(() => vi.useRealTimers())

const setup = () => ({ user: userEvent.setup(), ...render(<App />) })

const runDays = () => screen.getByRole('group', { name: 'Which days can you run?' })

async function fillGoal(user: ReturnType<typeof userEvent.setup>, h: string, m: string, s: string) {
  const goal = screen.getByRole('group', { name: 'Goal finish time' })
  await user.type(within(goal).getByLabelText('Hours'), h)
  await user.type(within(goal).getByLabelText('Minutes'), m)
  await user.type(within(goal).getByLabelText('Seconds'), s)
}

describe('building a plan', () => {
  it('lists upcoming races from the API', async () => {
    setup()

    expect(await screen.findByRole('radio', { name: /Comrades Marathon/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Another race/ })).toBeInTheDocument()
  })

  it('builds a plan for any race and sends the runner’s own choices', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('radio', { name: /Another race/ }))
    await user.click(screen.getByRole('radio', { name: '5K' }))
    await user.type(screen.getByLabelText('Race date'), '2026-12-13')
    await user.type(screen.getByLabelText(/Name/), 'Parkrun PB')
    await fillGoal(user, '0', '24', '30')
    await user.click(within(runDays()).getByRole('checkbox', { name: 'Saturday' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(lastPlanRequest.body).toMatchObject({
      distanceKm: 5,
      raceDate: '2026-12-13',
      goalTime: '00:24:30',
      runDays: ['Tuesday', 'Thursday', 'Sunday'],
      longRunDay: 'Sunday',
      planFrom: '2026-10-08',
    })
    expect(window.location.search).toContain('goal=1470')
  })

  it('shows the pace a goal works out to', async () => {
    const { user } = setup()

    await user.click(await screen.findByRole('radio', { name: /Cape Town Marathon/ }))
    await fillGoal(user, '4', '0', '0')

    expect(screen.getByText('That’s 5:41/km on average.')).toBeInTheDocument()
  })

  it('catches missing answers before calling the API', async () => {
    const { user } = setup()
    await screen.findByRole('radio', { name: /Comrades/ })

    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    const errors = screen.getByRole('alert')
    expect(within(errors).getByText(/Choose a race/)).toBeInTheDocument()
    expect(within(errors).getByText(/Enter a goal time/)).toBeInTheDocument()
    expect(lastPlanRequest.body).toBeUndefined()
  })

  it('needs at least three run days and a long-run day among them', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await fillGoal(user, '11', '0', '0')

    await user.click(within(runDays()).getByRole('checkbox', { name: 'Sunday' }))
    await user.click(within(runDays()).getByRole('checkbox', { name: 'Saturday' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    // Each message shows twice by design: in the summary at the top and beside its field.
    expect(within(screen.getByRole('alert')).getByText(/Pick at least three days/)).toBeInTheDocument()
    expect(within(runDays()).getByText(/Pick at least three days/)).toBeInTheDocument()
    expect(screen.getAllByText(/Pick which of your days is the long run/)).toHaveLength(2)
  })

  it('puts the API’s validation messages next to the right field', async () => {
    server.use(
      http.post('*/api/v1/plans', () =>
        HttpResponse.json(
          { title: 'One or more fields are invalid.', code: 'validation_failed', errors: { GoalTime: ['That time works out to an unrealistic pace.'] } },
          { status: 400 },
        ),
      ),
    )
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await fillGoal(user, '0', '3', '0')

    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    const goal = screen.getByRole('group', { name: 'Goal finish time' })
    expect(await within(goal).findByText('That time works out to an unrealistic pace.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Your plan' })).not.toBeInTheDocument()
  })

  it('explains a rate limit in plain words', async () => {
    server.use(http.post('*/api/v1/plans', () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '42' } })))
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await fillGoal(user, '11', '0', '0')

    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    expect(await screen.findByText(/Try again in 42 seconds/)).toBeInTheDocument()
  })

  it('suggests a goal from a recent race', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Cape Town Marathon/ }))
    await user.click(screen.getByText('Not sure? Estimate it from a recent race'))

    const estimate = screen.getByRole('group', { name: 'Your time' })
    await user.type(within(estimate).getByLabelText('Minutes'), '50')
    await user.click(screen.getByRole('button', { name: 'Estimate my goal' }))
    await user.click(await screen.findByRole('button', { name: 'Use this time' }))

    const goal = screen.getByRole('group', { name: 'Goal finish time' })
    expect(within(goal).getByLabelText('Hours')).toHaveValue('1')
    expect(within(goal).getByLabelText('Minutes')).toHaveValue('51')
  })
})

describe('when things go wrong', () => {
  it('still lets you enter any race if the race list fails, and can retry', async () => {
    server.use(http.get('*/api/v1/races', () => HttpResponse.json({}, { status: 503 })))
    const { user } = setup()

    expect(await screen.findByText('We couldn’t load the race list.')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Another race/ })).toBeInTheDocument()

    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('radio', { name: /Comrades/ })).toBeInTheDocument()
  })

  it('offers a retry when the server can’t build the plan', async () => {
    server.use(http.post('*/api/v1/plans', () => HttpResponse.json({}, { status: 500 })))
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await fillGoal(user, '11', '0', '0')

    await user.click(screen.getByRole('button', { name: 'Build my plan' }))

    expect(await screen.findByText('We couldn’t build that plan.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
  })
})

describe('a shared plan', () => {
  const link = '?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&gym=mo&from=2026-10-08'

  it('rebuilds straight from the link', async () => {
    window.history.replaceState(null, '', `/${link}`)
    setup()

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(lastPlanRequest.body).toMatchObject({ planFrom: '2026-10-08', strengthDays: ['Monday'] })
  })

  it('switches every distance and pace to miles', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByRole('radio', { name: 'Miles' }))

    expect(screen.getByText('3.1 mi')).toBeInTheDocument()
    expect(screen.getAllByText(/\/mi/).length).toBeGreaterThan(0)
    expect(window.localStorage.getItem('startline:units')).toBe('mi')
  })

  it('remembers ticked-off sessions on this device', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user, unmount } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    const firstDone = screen.getAllByRole('checkbox', { name: 'Done' })[0]!
    await user.click(firstDone)
    expect(firstDone).toBeChecked()
    unmount()

    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Done' })[0]).toBeChecked())
  })

  it('opens the current week and shows rest days', async () => {
    window.history.replaceState(null, '', `/${link}`)
    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Easier week').length).toBeGreaterThan(0)
  })
})
