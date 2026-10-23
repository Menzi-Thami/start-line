import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { DatePicker } from './DatePicker'

function Field({ min, max }: { min?: string; max?: string }) {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="d">Start on</label>
      <DatePicker id="d" value={value} onChange={setValue} min={min} max={max} today="2026-10-08" />
      <button type="button">Elsewhere</button>
    </>
  )
}

describe('the date picker', () => {
  it('opens a month of days, Monday first, and closes on the day picked', async () => {
    const user = userEvent.setup()
    render(<Field />)

    expect(screen.getByLabelText('Start on')).toHaveTextContent('Choose a day')
    await user.click(screen.getByLabelText('Start on'))
    const calendar = screen.getByRole('dialog', { name: 'Choose a date' })
    expect(within(calendar).getByText('October 2026')).toBeInTheDocument()
    expect(within(calendar).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'])

    await user.click(within(calendar).getByRole('button', { name: 'Thursday 15 October 2026' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Start on')).toHaveTextContent('Thursday 15 October 2026')
  })

  it('steps between months, never past the days allowed', async () => {
    const user = userEvent.setup()
    render(<Field min="2026-10-08" max="2026-11-20" />)
    await user.click(screen.getByLabelText('Start on'))

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Wednesday 7 October 2026' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saturday 21 November 2026' })).toBeDisabled()
  })

  it('closes on Escape or a tap outside, without changing anything', async () => {
    const user = userEvent.setup()
    render(<Field />)

    await user.click(screen.getByLabelText('Start on'))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Start on')).toHaveFocus()

    await user.click(screen.getByLabelText('Start on'))
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Start on')).toHaveTextContent('Choose a day')
  })

  it('jumps months at a time from the year, never to a month with no day allowed', async () => {
    const user = userEvent.setup()
    render(<Field min="2026-10-22" max="2027-06-30" />)
    await user.click(screen.getByLabelText('Start on'))

    await user.click(screen.getByRole('button', { name: 'October 2026' }))
    expect(screen.getByRole('button', { name: 'September 2026' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(screen.getByRole('button', { name: 'July 2027' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next year' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'March 2027' }))
    await user.click(screen.getByRole('button', { name: 'Sunday 14 March 2027' }))
    expect(screen.getByLabelText('Start on')).toHaveTextContent('Sunday 14 March 2027')
  })

  it('shows only the month’s own days, and marks today', async () => {
    const user = userEvent.setup()
    render(<Field />)
    await user.click(screen.getByLabelText('Start on'))

    // October 2026 starts on a Thursday: the Monday to Wednesday before it stay blank.
    expect(screen.queryByRole('button', { name: 'Wednesday 30 September 2026' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('gridcell')[3]).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Thursday 8 October 2026' })).toHaveAttribute('aria-current', 'date')
  })
})
