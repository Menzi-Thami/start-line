import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DurationInput } from './controls'
import type { Duration } from './duration'
import { TimeWheel, WHEEL_ROW, WHEEL_SETTLE_MS } from './TimeWheel'

afterEach(() => vi.useRealTimers())

const wheelOf = (container: HTMLElement) => container.querySelector<HTMLDivElement>('.wheel-track')!

function Goal({ start = { h: '', m: '', s: '' } }: { start?: Duration }) {
  const [value, setValue] = useState<Duration>(start)
  return (
    <>
      <DurationInput legend="Goal finish time" value={value} onChange={setValue} />
      <output>{`${value.h}:${value.m}:${value.s}`}</output>
    </>
  )
}

describe('the time wheels', () => {
  it('picks the number a runner scrolls onto the line, once the wheel settles', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { container } = render(<TimeWheel id="m" label="Minutes" value="" max={59} onChange={onChange} />)
    const wheel = wheelOf(container)

    fireEvent.pointerDown(wheel)
    wheel.scrollTop = 7 * WHEEL_ROW + 10
    fireEvent.scroll(wheel)
    expect(onChange).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(WHEEL_SETTLE_MS))

    expect(onChange).toHaveBeenCalledWith('7')
  })

  it('never picks a number just because the wheel moved to show one', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { container, rerender } = render(<TimeWheel id="m" label="Minutes" value="" max={59} onChange={onChange} />)

    rerender(<TimeWheel id="m" label="Minutes" value="25" max={59} onChange={onChange} />)
    fireEvent.scroll(wheelOf(container))
    await act(() => vi.advanceTimersByTimeAsync(WHEEL_SETTLE_MS))

    expect(wheelOf(container).scrollTop).toBe(25 * WHEEL_ROW)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('takes a tap on a number, typing, and the arrow keys, and stays between 0 and its maximum', async () => {
    const user = userEvent.setup()
    render(<Goal start={{ h: '3', m: '59', s: '' }} />)

    await user.click(screen.getAllByText('45')[1]!) // the minutes wheel
    expect(screen.getByRole('status')).toHaveTextContent('3:45:')

    await user.clear(screen.getByLabelText('Hours'))
    await user.type(screen.getByLabelText('Hours'), '4')
    await user.type(screen.getByLabelText('Seconds'), '{ArrowDown}{ArrowUp}{ArrowUp}')
    expect(screen.getByRole('status')).toHaveTextContent('4:45:2')

    await user.clear(screen.getByLabelText('Minutes'))
    await user.type(screen.getByLabelText('Minutes'), '75')
    expect(screen.getByRole('status')).toHaveTextContent('4:59:2')
  })

  it('marks the chosen number on each wheel', () => {
    const { container } = render(<Goal start={{ h: '1', m: '5', s: '30' }} />)

    expect([...container.querySelectorAll('.wheel-item.is-selected')].map((n) => n.textContent)).toEqual(['01', '05', '30'])
  })
})
