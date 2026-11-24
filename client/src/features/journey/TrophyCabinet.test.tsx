import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { majorDefinitions, raceMemory } from './race-history-fixtures'
import * as sharing from './share-card'
import { TrophyCabinet } from './TrophyCabinet'

afterEach(() => vi.restoreAllMocks())

describe('a cabinet for every runner', () => {
  it('gives a local half-marathon finish its own achievement card rather than sharing an empty Majors collection', async () => {
    const save = vi.spyOn(sharing, 'downloadCard').mockResolvedValue('png')
    render(<TrophyCabinet history={{ races: [raceMemory({ eventName: 'My first half', eventDistanceKm: 21.1, major: null, majorEligible: false })], majors: majorDefinitions }}
      units="km" onMajor={vi.fn()} onRace={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save cabinet card' }))
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ heading: 'EVERY FINISH COUNTS', raceName: 'My first half',
      stats: [{ value: '1', label: 'Race finishes confirmed' }, { value: '21.1 km', label: 'Combined event distance' }, { value: '1', label: 'Years with a finish' }],
    }), 'taperday-trophy-cabinet')
    expect(save.mock.calls[0]?.[0]).not.toHaveProperty('medals')
  })
})

it('uses a singular finish in the exported card for one eligible Major', async () => {
  const save = vi.spyOn(sharing, 'downloadCard').mockResolvedValue('png')
  render(<TrophyCabinet history={{ races: [raceMemory({ major: 'London', majorEligible: true })], majors: majorDefinitions }} units="km" onMajor={vi.fn()} onRace={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Save cabinet card' }))
  expect(save.mock.calls[0]?.[0].footer).toMatch(/^1 RACE FINISH ·/)
})
