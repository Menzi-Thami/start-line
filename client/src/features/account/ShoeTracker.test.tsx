import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { AuthContext, accountsOff } from '../../app/auth-context'
import type { Activity, SaveShoe, Shoe } from '../../lib/types'
import longRunFixture from '../../test/fixtures/activity-long-run.json'
import { server } from '../../test/server'
import { ShoePicker } from '../activities/ShoePicker'
import { ShoeTracker } from './ShoeTracker'

const auth = { ...accountsOff, enabled: true, account: { name: 'Thandi', email: 'thandi@example.test' }, getToken: () => Promise.resolve('test-token') }

const pair = (overrides: Partial<Shoe> = {}): Shoe => ({
  id: 'p1', name: 'Pegasus 41', startingKm: 100, limitKm: 700, totalKm: 640, runs: 12, stravaKm: 0, lastRunOn: '2026-10-29',
  isDefault: true, remindAtLimit: true, retired: false, wear: 'NearingLimit', ...overrides,
})

const withAuth = (ui: React.ReactNode) => render(<AuthContext.Provider value={auth}>{ui}</AuthContext.Provider>)

describe('Your shoes', () => {
  it('shows each pair’s distance towards its limit in words, not colour alone', async () => {
    server.use(http.get('*/api/v1/me/shoes', () => HttpResponse.json([pair(), pair({ id: 'p2', name: 'Old racers', totalKm: 820, wear: 'PastLimit', isDefault: false, retired: true, stravaKm: 12 })])))
    withAuth(<ShoeTracker units="km" />)

    const meter = await screen.findByRole('meter', { name: 'Pegasus 41: distance towards its limit' })
    expect(meter).toHaveAttribute('aria-valuetext', '640 km of 700 km')
    expect(screen.getByText('Nearing its limit')).toBeInTheDocument()
    expect(screen.getByText('Past its limit: time for a new pair?')).toBeInTheDocument()
    expect(screen.getByText('New runs')).toBeInTheDocument()
    expect(screen.getByText('Retired')).toBeInTheDocument()
    expect(screen.getByText(/counts while Taperday holds them|count while Taperday holds them/)).toBeInTheDocument()
  })

  it('adds a pair, the first one becoming where new runs go', async () => {
    let shoes: Shoe[] = []
    let sent: SaveShoe | undefined
    server.use(
      http.get('*/api/v1/me/shoes', () => HttpResponse.json(shoes)),
      http.post('*/api/v1/me/shoes', async ({ request }) => {
        sent = (await request.json()) as SaveShoe
        shoes = [pair({ name: sent.name, totalKm: sent.startingKm, runs: 0, wear: 'Fine' })]
        return HttpResponse.json(shoes[0], { status: 201 })
      }),
    )
    const user = userEvent.setup()
    withAuth(<ShoeTracker units="km" />)

    await user.click(await screen.findByRole('button', { name: 'Add a pair' }))
    await user.type(screen.getByLabelText('Name'), 'Clifton 9')
    await user.clear(screen.getByLabelText('Already run (km)'))
    await user.type(screen.getByLabelText('Already run (km)'), '45')
    await user.click(screen.getByRole('button', { name: 'Add pair' }))

    expect(sent).toMatchObject({ name: 'Clifton 9', startingKm: 45, limitKm: 700, isDefault: true, remindAtLimit: true })
    expect(await screen.findByText('Added Clifton 9.')).toBeInTheDocument()
    expect(await screen.findByText('Clifton 9')).toBeInTheDocument()
  })

  it('puts chosen past runs on a pair', async () => {
    let added: unknown
    server.use(
      http.get('*/api/v1/me/shoes', () => HttpResponse.json([pair()])),
      http.get('*/api/v1/me/shoes/unworn-runs', () => HttpResponse.json([
        { activityId: 'r1', checkInId: null, date: '2026-10-20', distanceKm: 10, title: 'Long run', source: 'Upload' },
        { activityId: null, checkInId: 'c1', date: '2026-10-18', distanceKm: 6, title: 'Easy', source: 'CheckIn' },
      ])),
      http.post('*/api/v1/me/shoes/p1/runs', async ({ request }) => {
        added = await request.json()
        return HttpResponse.json({ added: 2 })
      }),
    )
    const user = userEvent.setup()
    withAuth(<ShoeTracker units="km" />)

    await user.click(await screen.findByText('Add past runs to a pair'))
    const runs = await screen.findByRole('group', { name: 'Runs without a pair' })
    for (const box of within(runs).getAllByRole('checkbox')) await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Add 2 runs' }))

    expect(added).toEqual({ activityIds: ['r1'], checkInIds: ['c1'] })
    expect(await screen.findByText('Added 2 runs to Pegasus 41.')).toBeInTheDocument()
  })

  it('asks before deleting a pair', async () => {
    let deleted = false
    server.use(
      http.get('*/api/v1/me/shoes', () => HttpResponse.json([pair()])),
      http.delete('*/api/v1/me/shoes/p1', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const user = userEvent.setup()
    withAuth(<ShoeTracker units="km" />)

    await user.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(deleted).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('Deleted Pegasus 41.')).toBeInTheDocument()
    expect(deleted).toBe(true)
  })
})

describe('Shoes on a run', () => {
  const run = { ...(longRunFixture as Activity), shoe: null }

  it('puts the run on a pair and reverts if saving fails', async () => {
    const worn: unknown[] = []
    let fail = false
    server.use(
      http.get('*/api/v1/me/shoes', () => HttpResponse.json([pair(), pair({ id: 'p2', name: 'Trail shoes', isDefault: false })])),
      http.put('*/api/v1/me/shoes/worn', async ({ request }) => {
        worn.push(await request.json())
        return fail ? HttpResponse.json({ detail: 'Those shoes are retired.' }, { status: 409 }) : new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    withAuth(<ShoePicker run={run} />)

    const select = await screen.findByLabelText('Shoes')
    await user.selectOptions(select, 'p2')
    expect(await screen.findByText('Saved: worn in Trail shoes.')).toBeInTheDocument()
    expect(worn).toEqual([{ shoeId: 'p2', activityId: run.id }])

    fail = true
    await user.selectOptions(select, 'p1')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(select).toHaveValue('p2')
  })

  it('points to Account when there are no shoes yet', async () => {
    withAuth(<ShoePicker run={run} />)
    expect(await screen.findByText('Add your shoes in Account › Shoes to count their kilometres.')).toBeInTheDocument()
  })
})
