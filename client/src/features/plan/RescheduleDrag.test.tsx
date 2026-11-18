import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { planFixture } from '../../test/server'
import { WeekGlance } from './WeekGlance'

describe('reschedule from calendar drag', () => {
  it('routes a drop on another date to Move Run without changing the plan', () => {
    const week = planFixture.weeks.find(w => w.sessions.some(s => s.type !== 'Strength' && s.type !== 'Race'))!
    const from = week.sessions.find(s => s.type !== 'Strength' && s.type !== 'Race')!.date
    const target = from === week.startDate ? new Date(Date.parse(from + 'T12:00:00Z') + 86_400_000).toISOString().slice(0, 10) : week.startDate
    const requestMove = vi.fn()
    const transfer = { setData: vi.fn(), getData: vi.fn(() => from), effectAllowed: 'move' }
    const { container } = render(<WeekGlance week={week} today={week.startDate} units="km" done={new Set()} onSelectDate={() => {}} onRequestMove={requestMove} />)
    const origin = container.querySelector<HTMLButtonElement>(`[data-date="${from}"]`)!
    const destination = container.querySelector<HTMLButtonElement>(`[data-date="${target}"]`)!
    expect(origin.draggable).toBe(true)
    fireEvent.dragStart(origin, { dataTransfer: transfer })
    fireEvent.dragOver(destination, { dataTransfer: transfer })
    fireEvent.drop(destination, { dataTransfer: transfer })
    expect(requestMove).toHaveBeenCalledWith(from, target)
    expect(origin).toBeInTheDocument()
  })
})
