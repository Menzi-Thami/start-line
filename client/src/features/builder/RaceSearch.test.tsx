import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { PlanInputs } from '../../lib/plan-url'
import type { Race } from '../../lib/types'
import { racesFixture, server } from '../../test/server'
import { BuilderForm } from './BuilderForm'

const knysna: Race = {
  slug: 'knysna-forest-marathon-2027', name: 'Knysna Forest Marathon', date: '2027-07-03', distanceKm: 42.195, location: 'Knysna',
  summary: 'Forest roads.', website: null, dateStatus: 'Confirmed', distanceConfirmed: true, major: false,
}

const builder = (initial: PlanInputs | null = null) =>
  render(<BuilderForm races={{ kind: 'ready', races: racesFixture }} onRetryRaces={vi.fn()} initial={initial} units="km" busy={false} serverErrors={{}} today="2026-11-09" onSubmit={vi.fn()} />)

describe('finding a race that isn’t on the rack', () => {
  it('searches as the runner types and picks a result as their race', async () => {
    const asked: string[] = []
    server.use(http.get('*/api/v1/races/search', ({ request }) => {
      const q = new URL(request.url).searchParams.get('q') ?? ''
      asked.push(q)
      return HttpResponse.json(q.toLowerCase().includes('knys') ? [knysna] : [])
    }))
    const user = userEvent.setup()
    builder()

    const search = screen.getByRole('searchbox', { name: 'Looking for another race?' })
    await user.type(search, 'k')
    expect(asked).toHaveLength(0)
    await user.type(search, 'nysna')
    const result = await screen.findByRole('radio', { name: /Knysna Forest Marathon/ })
    expect(screen.getByText('1 race found.')).toBeInTheDocument()
    await user.click(result)
    expect(result).toBeChecked()
    expect(within(screen.getByRole('radiogroup', { name: 'Race' })).getAllByRole('radio', { checked: true })).toHaveLength(1)

    await user.clear(search)
    await user.type(search, 'zz top')
    expect(await screen.findByText(/No upcoming race matches “zz top”/)).toBeInTheDocument()
    // The picked race stays visible and picked while other text is searched.
    expect(screen.getByRole('radio', { name: /Knysna Forest Marathon/ })).toBeChecked()
  })

  it('looks a saved plan’s searched-for race up again, so its date and distance drive the goal', async () => {
    server.use(http.get('*/api/v1/races/:slug', ({ params }) => (params.slug === knysna.slug ? HttpResponse.json(knysna) : new HttpResponse(null, { status: 404 }))))
    builder({ raceSlug: knysna.slug, goalSeconds: 4 * 3600, runDays: ['Tuesday', 'Thursday', 'Saturday', 'Sunday'], longRunDay: 'Sunday', experience: 'Regular', strengthDays: [], planFrom: '2026-11-09' })
    expect(await screen.findByText(/Knysna Forest Marathon, Saturday 3 July 2027/)).toBeInTheDocument()
  })
})
