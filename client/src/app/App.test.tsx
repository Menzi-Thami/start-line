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
type User = ReturnType<typeof userEvent.setup>

const runDays = () => screen.getByRole('group', { name: 'Which days can you run?' })
const wizard = () => screen.queryByRole('form', { name: 'Build your plan' })
const onStep = (n: number) => expect(screen.getByText(`Step ${n} of 5`)).toBeInTheDocument()
const next = (user: User) => user.click(screen.getByRole('button', { name: 'Continue' }))
const buildIt = (user: User) => user.click(screen.getByRole('button', { name: 'Build my plan' }))

async function fillGoal(user: User, h: string, m: string, s: string) {
  const goal = screen.getByRole('group', { name: 'Goal finish time' })
  await user.type(within(goal).getByLabelText('Hours'), h)
  await user.type(within(goal).getByLabelText('Minutes'), m)
  await user.type(within(goal).getByLabelText('Seconds'), s)
}

/** Picks Comrades and a goal, takes the defaults for everything else, and stops on the summary screen. */
async function answerEverything(user: User, goal: [string, string, string] = ['11', '0', '0']) {
  await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
  await next(user)
  await fillGoal(user, ...goal)
  await next(user)
  await next(user)
  await next(user)
}

describe('the home page', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  const withMotion = (reduce = false) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }))
  const intro = () => document.querySelector('.race-intro')

  it('counts down to the next race on the list', async () => {
    setup()

    // Today is pinned to 8 October 2026; the first race in the fixture is Two Oceans on 4 April 2027.
    expect(await screen.findByRole('group', { name: '178 days to go: Two Oceans Ultra' })).toBeInTheDocument()
  })

  it('plays the starting-gun intro once per visit, and a tap skips it', async () => {
    withMotion()
    const { user, unmount } = setup()

    expect(intro()).not.toBeNull()
    await user.click(document.body)
    expect(intro()).toBeNull()
    unmount()

    setup()
    expect(intro()).toBeNull()
  })

  it('leaves the intro out for anyone who has asked for less motion', () => {
    withMotion(true)
    setup()

    expect(intro()).toBeNull()
  })

  it('goes straight to a shared plan, without the intro', async () => {
    withMotion()
    window.history.replaceState(null, '', '/?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&from=2026-10-08')
    setup()

    expect(intro()).toBeNull()
    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
  })
})

describe('building a plan', () => {
  it('lists upcoming races from the API', async () => {
    setup()

    expect(await screen.findByRole('radio', { name: /Comrades Marathon/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Another race/ })).toBeInTheDocument()
  })

  it('shows each race’s date plainly, and a distance still being re-measured as approximate', async () => {
    setup()

    const comrades = await screen.findByRole('radio', { name: /Comrades Marathon/ })
    expect(comrades).toHaveAccessibleName(expect.stringContaining('About 90 km'))
    expect(comrades).toHaveAccessibleName(expect.stringContaining('13 Jun 2027'))
    expect(screen.getByRole('radio', { name: /Cape Town Marathon/ })).not.toHaveAccessibleName(expect.stringContaining('to be confirmed'))
  })

  it('asks one question per screen, then builds the plan from the runner’s own choices', async () => {
    const { user } = setup()
    onStep(1)
    expect(screen.getByRole('heading', { name: 'Which race?' })).toBeInTheDocument()

    await user.click(await screen.findByRole('radio', { name: /Another race/ }))
    await user.click(screen.getByRole('radio', { name: '5K' }))
    await user.type(screen.getByLabelText('Race date'), '2026-12-13')
    await user.type(screen.getByLabelText(/Name/), 'Parkrun PB')
    await next(user)

    onStep(2)
    expect(screen.queryByRole('radio', { name: /Another race/ })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What’s your goal time?' })).toHaveFocus()
    await fillGoal(user, '0', '24', '30')
    await next(user)

    onStep(3)
    await user.click(within(runDays()).getByRole('checkbox', { name: 'Saturday' }))
    await next(user)

    onStep(4)
    await next(user)

    onStep(5)
    expect(screen.getByText(/Parkrun PB: 5 km/)).toBeInTheDocument()
    expect(screen.getByText('Tue, Thu, Sun. Long run on Sunday.')).toBeInTheDocument()
    await buildIt(user)

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(wizard()).not.toBeInTheDocument()
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
    await next(user)
    await fillGoal(user, '4', '0', '0')

    expect(screen.getByText('That’s 5:41/km on average.')).toBeInTheDocument()
  })

  it('checks each screen before moving on, and only that screen', async () => {
    const { user } = setup()
    await screen.findByRole('radio', { name: /Comrades/ })

    await next(user)

    onStep(1)
    expect(within(screen.getByRole('alert')).getByText(/Choose a race/)).toBeInTheDocument()
    expect(screen.queryByText(/Enter a goal time/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Comrades/ }))
    await next(user)
    await next(user)

    onStep(2)
    expect(within(screen.getByRole('alert')).getByText(/Enter a goal time/)).toBeInTheDocument()
    expect(lastPlanRequest.body).toBeUndefined()
  })

  it('needs at least three run days and a long-run day among them', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await next(user)
    await fillGoal(user, '11', '0', '0')
    await next(user)

    await user.click(within(runDays()).getByRole('checkbox', { name: 'Sunday' }))
    await user.click(within(runDays()).getByRole('checkbox', { name: 'Saturday' }))
    await next(user)

    // Each message shows twice by design: in the summary at the top and beside its field.
    onStep(3)
    expect(within(screen.getByRole('alert')).getByText(/Pick at least three days/)).toBeInTheDocument()
    expect(within(runDays()).getByText(/Pick at least three days/)).toBeInTheDocument()
    expect(screen.getAllByText(/Pick which of your days is the long run/)).toHaveLength(2)
  })

  it('keeps every answer when going back', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Comrades/ }))
    await next(user)
    await fillGoal(user, '11', '30', '0')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    onStep(1)
    expect(screen.getByRole('radio', { name: /Comrades/ })).toBeChecked()

    await next(user)
    const goal = screen.getByRole('group', { name: 'Goal finish time' })
    expect(within(goal).getByLabelText('Hours')).toHaveValue('11')
    expect(within(goal).getByLabelText('Minutes')).toHaveValue('30')
  })

  it('jumps straight to a screen from the summary', async () => {
    const { user } = setup()
    await answerEverything(user)

    await user.click(screen.getByRole('button', { name: 'Change days' }))

    onStep(3)
    expect(runDays()).toBeInTheDocument()
  })

  it('takes the runner back to the screen the API complained about', async () => {
    server.use(
      http.post('*/api/v1/plans', () =>
        HttpResponse.json(
          { title: 'One or more fields are invalid.', code: 'validation_failed', errors: { GoalTime: ['That time works out to an unrealistic pace.'] } },
          { status: 400 },
        ),
      ),
    )
    const { user } = setup()
    await answerEverything(user, ['0', '3', '0'])

    await buildIt(user)

    const goal = await screen.findByRole('group', { name: 'Goal finish time' })
    onStep(2)
    expect(within(goal).getByText('That time works out to an unrealistic pace.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Parkrun PB' })).not.toBeInTheDocument()
  })

  it('explains a rate limit in plain words', async () => {
    server.use(http.post('*/api/v1/plans', () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '42' } })))
    const { user } = setup()
    await answerEverything(user)

    await buildIt(user)

    expect(await screen.findByText(/Try again in 42 seconds/)).toBeInTheDocument()
  })

  it('suggests a goal from a recent race', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('radio', { name: /Cape Town Marathon/ }))
    await next(user)
    await user.click(screen.getByText('Not sure? Estimate it from a recent race'))

    const estimate = screen.getByRole('group', { name: 'Your time' })
    await user.type(within(estimate).getByLabelText('Minutes'), '50')
    await user.click(screen.getByRole('button', { name: 'Estimate my goal' }))
    await user.click(await screen.findByRole('button', { name: 'Use this time' }))

    const goal = screen.getByRole('group', { name: 'Goal finish time' })
    expect(within(goal).getByLabelText('Hours')).toHaveValue('1')
    expect(within(goal).getByLabelText('Minutes')).toHaveValue('51')
  })

  it('reopens the answers on the summary from a built plan, and goes back to it', async () => {
    const { user } = setup()
    await answerEverything(user)
    await buildIt(user)
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByRole('button', { name: 'Change answers' }))

    onStep(5)
    expect(screen.getByText(/Comrades Marathon, Sunday 13 June 2027/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Parkrun PB' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to your plan' }))
    expect(screen.getByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(wizard()).not.toBeInTheDocument()
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
    await answerEverything(user)

    await buildIt(user)

    expect(await screen.findByText('We couldn’t build that plan.')).toBeInTheDocument()
    server.resetHandlers()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
  })
})

describe('a shared plan', () => {
  const link = '?km=5&date=2026-12-13&name=Parkrun+PB&goal=1470&days=tu.th.sa.su&long=su&exp=regular&gym=mo&from=2026-10-08'

  it('rebuilds straight from the link, without the questions', async () => {
    window.history.replaceState(null, '', `/${link}`)
    setup()

    expect(await screen.findByRole('heading', { name: 'Parkrun PB' })).toBeInTheDocument()
    expect(wizard()).not.toBeInTheDocument()
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
    // Ticking throws a little confetti...
    expect(document.querySelector('.sparks')).not.toBeNull()
    unmount()

    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: 'Done' })[0]).toBeChecked())
    // ...but a session that was already done doesn't celebrate again on every visit.
    expect(document.querySelector('.sparks')).toBeNull()
  })

  it('splits the plan into tabs and opens on this week', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    const tabs = screen.getByRole('tablist', { name: 'Your plan' })
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['This week', 'All weeks', 'Strength', 'Paces', 'Progress'])
    expect(within(tabs).getByRole('tab', { name: 'This week' })).toHaveAttribute('aria-selected', 'true')
    // The plan starts on Monday 12 October, after "today", so This week shows the first week.
    expect(screen.getByRole('heading', { name: 'Your first week' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Weekly distance' })).not.toBeInTheDocument()

    await user.click(within(tabs).getByRole('tab', { name: 'Paces' }))
    expect(screen.getByRole('tabpanel', { name: 'Paces' })).toHaveTextContent('Recovery')
    expect(screen.queryByRole('heading', { name: 'Your first week' })).not.toBeInTheDocument()

    await user.keyboard('{ArrowRight}')
    expect(within(tabs).getByRole('tab', { name: 'Progress' })).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Weekly distance' })).toBeInTheDocument()
  })

  it('shows this week’s strength with sets to tick off, and remembers them', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user, unmount } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByRole('tab', { name: 'Strength' }))
    const panel = screen.getByRole('tabpanel', { name: 'Strength' })
    expect(within(panel).getByRole('heading', { name: /Strength & mobility/ })).toBeInTheDocument()
    expect(within(panel).getByText('Romanian deadlift')).toBeInTheDocument()
    expect(within(panel).getByText('3 × 8 each leg')).toBeInTheDocument()
    expect(within(panel).getByText('0 of 18 sets done')).toBeInTheDocument()

    const squats = within(panel).getByRole('group', { name: 'Squat sets' })
    await user.click(within(squats).getByRole('checkbox', { name: 'Squat, set 1 of 3: 10' }))
    expect(within(panel).getByText('1 of 18 sets done')).toBeInTheDocument()
    unmount()

    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })
    expect(screen.getAllByRole('checkbox', { name: 'Squat, set 1 of 3: 10', hidden: true })[0]).toBeChecked()
  })

  it('ticks every set when a strength session is ticked done, and the session when every set is', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })
    // Monday's strength session comes first in the week.
    const mondayDone = () => screen.getAllByRole('checkbox', { name: 'Done', hidden: true })[0]

    await user.click(mondayDone()!)
    await user.click(screen.getByRole('tab', { name: 'Strength' }))
    const panel = screen.getByRole('tabpanel', { name: 'Strength' })
    expect(within(panel).getByText('All sets done. Nice work.')).toBeInTheDocument()

    await user.click(within(panel).getByRole('checkbox', { name: 'Plank, set 3 of 3: 30 s' }))
    expect(within(panel).getByText('17 of 18 sets done')).toBeInTheDocument()
    expect(mondayDone()).not.toBeChecked()

    await user.click(within(panel).getByRole('checkbox', { name: 'Plank, set 3 of 3: 30 s' }))
    expect(mondayDone()).toBeChecked()
  })

  it('keeps sharing in one menu', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByText('Share'))

    for (const action of ['Copy link to this plan', 'Print']) {
      expect(screen.getByRole('button', { name: action })).toBeVisible()
    }

    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Print', hidden: true })).not.toBeVisible()

    await user.click(screen.getByText('Share'))
    await user.click(screen.getByRole('heading', { name: 'Parkrun PB' }))
    expect(screen.getByRole('button', { name: 'Print', hidden: true })).not.toBeVisible()
  })

  it('offers to subscribe Apple, Google or Outlook calendars to the plan', async () => {
    window.history.replaceState(null, '', `/${link}`)
    const { user } = setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    await user.click(screen.getByText('Add to calendar'))

    const apple = screen.getByRole('link', { name: /Apple Calendar/ })
    const appleHref = apple.getAttribute('href') ?? ''
    expect(appleHref.startsWith('webcal://')).toBe(true)
    expect(appleHref).toContain('/api/v1/plans/calendar.ics?')
    expect(appleHref).toContain('goalTime=00%3A24%3A30')
    expect(screen.getByRole('link', { name: /Google Calendar/ }).getAttribute('href')?.startsWith('https://calendar.google.com/')).toBe(true)
    expect(screen.getByRole('link', { name: /Outlook/ }).getAttribute('href')?.startsWith('https://outlook.live.com/')).toBe(true)
    expect(screen.getByRole('button', { name: /Download a calendar file/ })).toBeVisible()
  })

  it('shows how long until the plan starts, with the runner on their marks', async () => {
    window.history.replaceState(null, '', `/${link}`)
    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    // Today is Thursday 8 October; the plan starts on Monday 12 October.
    expect(screen.getByText('Starts in 4 days')).toBeInTheDocument()
    expect(document.querySelector('.plan-progress.is-before .runner-crouch')).not.toBeNull()
  })

  it('opens the current week and shows rest days', async () => {
    window.history.replaceState(null, '', `/${link}`)
    setup()
    await screen.findByRole('heading', { name: 'Parkrun PB' })

    expect(screen.getAllByText('Rest').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Easier week').length).toBeGreaterThan(0)
  })
})
