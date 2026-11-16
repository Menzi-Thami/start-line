import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { fromSearchParams, toSearchParams, type PlanInputs } from '../../lib/plan-url'
import { KM_PER_MILE, type Units } from '../../lib/format'
import { racesFixture, server } from '../../test/server'
import { BuilderForm, type RacesState } from './BuilderForm'

const saved: PlanInputs = { raceName: 'Local 15K', distanceKm: 15.75, raceDate: '2026-11-30', goalSeconds: 5400,
  runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: '2026-11-09', version: 3 }

function show(initial: PlanInputs | null = null, units: Units = 'km', races: RacesState = { kind: 'ready', races: racesFixture }) {
  const onSubmit = vi.fn()
  const rendered = render(<BuilderForm races={races} onRetryRaces={vi.fn()} initial={initial} units={units} busy={false}
    serverErrors={{}} today="2026-11-09" onSubmit={onSubmit} />)
  return { ...rendered, user: userEvent.setup(), onSubmit }
}

async function dateAndBuild(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByLabelText('Race date'))
  await user.click(screen.getByRole('button', { name: 'Monday 30 November 2026' }))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(within(screen.getByRole('group', { name: 'Suggested goal times' })).getByRole('button', { name: /Steady/ }))
  for (let step = 0; step < 3; step++) await user.click(screen.getByRole('button', { name: 'Continue' }))
  await user.click(screen.getByRole('button', { name: 'Build my plan' }))
}

describe('manual race setup', () => {
  it.each([
    ['5K', 5, 'km'], ['10K', 10, 'km'], ['15K', 15, 'km'], ['Half', 21.0975, 'km'], ['Marathon', 42.195, 'km'],
    ['Half', 21.0975, 'mi'], ['Marathon', 42.195, 'mi'],
  ] as const)('builds an unlisted %s (%s km) with %s display units', async (label, km, units) => {
    const { user, onSubmit, container } = show(null, units)
    await user.click(screen.getByRole('radio', { name: /Add a race manually/ }))
    expect(container.querySelector('.race-rack')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Name (optional)' }), 'Local race')
    await user.click(screen.getByRole('radio', { name: label }))
    await dateAndBuild(user)
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ raceName: 'Local race', raceDate: '2026-11-30', distanceKm: km, raceSlug: undefined })
  })

  it.each(['empty', 'failed'] as const)('reuses the search name when catalogue search is %s', async state => {
    server.use(http.get('*/api/v1/races/search', () => state === 'failed' ? new HttpResponse(null, { status: 503 }) : HttpResponse.json([])))
    const { user, onSubmit } = show()
    await user.type(screen.getByRole('searchbox', { name: 'Looking for another race?' }), 'My neighbourhood run')
    expect(await screen.findByText(state === 'failed' ? /Search isn’t available/ : /No upcoming race matches/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add this race manually' }))
    const name = screen.getByRole('textbox', { name: 'Name (optional)' })
    expect(name).toHaveValue('My neighbourhood run')
    expect(name).toHaveFocus()
    await user.type(screen.getByRole('textbox', { name: 'Distance (km)' }), '15.75')
    await dateAndBuild(user)
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ raceName: 'My neighbourhood run', distanceKm: 15.75 })
  })

  it.each([{ kind: 'loading' }, { kind: 'error', message: 'Catalogue unavailable.' }] satisfies RacesState[])('works while the catalogue is $kind and retains details when browsing it again', async races => {
    const { user } = show(null, 'km', races)
    await user.click(screen.getByRole('radio', { name: /Add a race manually/ }))
    await user.type(screen.getByRole('textbox', { name: 'Name (optional)' }), 'My race')
    await user.type(screen.getByRole('textbox', { name: 'Distance (km)' }), '12.34')
    await user.click(screen.getByRole('button', { name: 'Browse the catalogue instead' }))
    expect(screen.getByRole('radio', { name: /Add a race manually/ })).toHaveFocus()
    await user.click(screen.getByRole('radio', { name: /Add a race manually/ }))
    expect(screen.getByRole('textbox', { name: 'Name (optional)' })).toHaveValue('My race')
    expect(screen.getByRole('textbox', { name: 'Distance (km)' })).toHaveValue('12.34')
  })

  it.each(['km', 'mi'] as const)('preserves a saved decimal distance through a shared link and editing in %s', async units => {
    const reopened = fromSearchParams(toSearchParams(saved))!
    const { user, onSubmit } = show(reopened, units)
    await user.click(screen.getByRole('button', { name: 'Change race' }))
    if (units === 'km') expect(screen.getByRole('textbox', { name: 'Distance (km)' })).toHaveValue('15.75')
    for (let step = 0; step < 4; step++) await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ distanceKm: 15.75, raceName: saved.raceName, raceDate: saved.raceDate, version: 3, planFrom: saved.planFrom })
  })

  it('uses a typed distance in place of the old preset, with mile conversion only once', async () => {
    const { user, onSubmit } = show(null, 'mi')
    await user.click(screen.getByRole('radio', { name: /Add a race manually/ }))
    await user.click(screen.getByRole('radio', { name: 'Half' }))
    const distance = screen.getByRole('textbox', { name: 'Distance (mi)' })
    await user.clear(distance)
    await user.type(distance, '9.5')
    await dateAndBuild(user)
    expect(onSubmit.mock.calls[0]![0].distanceKm).toBe(9.5 * KM_PER_MILE)
  })

  it.each(['0', '-5', 'abc'])('keeps invalid distance %s visible and prevents continuing', async value => {
    const { user, onSubmit } = show()
    await user.click(screen.getByRole('radio', { name: /Add a race manually/ }))
    const distance = screen.getByRole('textbox', { name: 'Distance (km)' })
    await user.type(distance, value)
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(distance).toHaveValue(value)
    expect(distance).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('heading', { name: 'Which race?' })).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
