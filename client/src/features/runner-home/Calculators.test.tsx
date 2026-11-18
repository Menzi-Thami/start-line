import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { Calculators } from './Calculators'

const renderCalculators = () => {
  render(<Calculators units="km" maxHeartRate={190} race={null} />)
  return userEvent.setup()
}

describe('the calculators', () => {
  it('turns a distance and a time into a pace, and a pace into a finish time', async () => {
    const user = renderCalculators()
    const calculators = screen.getByRole('region', { name: 'Calculators' })

    const time = within(calculators).getByRole('group', { name: 'Your time' })
    const pace = within(calculators).getByRole('group', { name: 'Or a pace (per km)' })
    await user.type(within(time).getByLabelText('Minutes'), '50')
    expect(within(calculators).getByText('5:00/km')).toBeInTheDocument()

    await user.type(within(pace).getByLabelText('Minutes'), '6')
    expect(within(calculators).getByText('1:00:00')).toBeInTheDocument()
  })

  it('predicts race times from a recent race', async () => {
    const user = renderCalculators()
    await user.click(screen.getByRole('button', { name: 'Race times' }))

    await user.type(screen.getByLabelText('Minutes'), '24')
    await user.click(screen.getByRole('button', { name: 'Predict my race times' }))

    const table = await within(screen.getByRole('region', { name: 'Calculators' })).findByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(5)
  })

  it('lists heart-rate zones from the runner’s own maximum', async () => {
    const user = renderCalculators()
    await user.click(screen.getByRole('button', { name: 'Heart rate' }))

    expect(screen.getByLabelText('Your maximum heart rate (bpm)')).toHaveValue('190')
    expect(screen.getByText('Zone 2: Easy')).toBeInTheDocument()
    expect(screen.getByText('114–133 bpm')).toBeInTheDocument()
  })

  it('splits a goal by the kilometre, and says what to eat for a long race', async () => {
    const user = renderCalculators()
    await user.click(screen.getByRole('button', { name: 'Splits' }))
    await user.type(screen.getByLabelText('Minutes'), '50')
    const splitRows = within(within(screen.getByRole('region', { name: 'Calculators' })).getByRole('table')).getAllByRole('row').slice(1)
    expect(splitRows).toHaveLength(10)
    expect(splitRows.every((row) => within(row).getAllByRole('cell')[0]!.textContent === '5:00')).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Fuelling' }))
    await user.type(screen.getByLabelText('Hours'), '4')
    expect(screen.getByText(/60–90 g/)).toBeInTheDocument()
  })
})
