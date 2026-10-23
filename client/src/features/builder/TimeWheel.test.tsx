import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('picks the number a finger or a mouse wheel scrolls onto the line, once the wheel settles', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { container } = render(<TimeWheel id="m" label="Minutes" value="" max={59} onChange={onChange} />)
    const wheel = wheelOf(container)

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
    const { container } = render(<Goal start={{ h: '3', m: '59', s: '' }} />)

    await user.click(within(container.querySelectorAll<HTMLElement>('.wheel-track')[1]!).getByText('45'))
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

  it('picks a tapped number without bringing up the keyboard', async () => {
    const user = userEvent.setup()
    const { container } = render(<Goal start={{ h: '3', m: '45', s: '' }} />)
    const minutes = container.querySelectorAll<HTMLElement>('.wheel-track')[1]!

    await user.click(within(minutes).getByText('50'))
    expect(screen.getByRole('status')).toHaveTextContent('3:50:')
    expect(document.activeElement?.tagName).not.toBe('INPUT')
  })

  it('keeps following typed values after a tap, and settles a stray scroll back onto the line', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const { container, rerender } = render(<TimeWheel id="m" label="Minutes" value="10" max={59} onChange={onChange} />)
    const wheel = wheelOf(container)

    fireEvent.click(screen.getByText('12'))
    expect(onChange).toHaveBeenLastCalledWith('12')
    rerender(<TimeWheel id="m" label="Minutes" value="30" max={59} onChange={onChange} />)
    expect(wheel.scrollTop).toBe(30 * WHEEL_ROW)

    // A scroll that comes to rest half a row off, on the number already chosen, snaps back without picking again.
    fireEvent.scroll(wheel)
    await act(() => vi.advanceTimersByTimeAsync(WHEEL_SETTLE_MS))
    onChange.mockClear()
    wheel.scrollTop = 30 * WHEEL_ROW + 15
    fireEvent.scroll(wheel)
    await act(() => vi.advanceTimersByTimeAsync(WHEEL_SETTLE_MS))
    expect(onChange).not.toHaveBeenCalled()
    expect(wheel.scrollTop).toBe(30 * WHEEL_ROW)
  })
})
