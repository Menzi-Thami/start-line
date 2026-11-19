import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Activity } from '../../lib/types'
import fixture from '../../test/fixtures/activity-long-run.json'
import { PaceProfile } from './PaceProfile'
const run = fixture as Activity

describe('recorded split pace profile', () => {
  it('exposes recorded pace by keyboard and shows the work target band', async () => {
    render(<PaceProfile splits={run.splits} plan={run.plan} units="km" />)
    const point = screen.getByRole('button', { name: 'Split 2: 6:36/km' })
    point.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('status')).toHaveTextContent('Split 2 · 6:36/km')
    expect(screen.getByText(/Shaded band: the work target/)).toBeInTheDocument()
  })
  it('does not draw a chart from missing or invalid pace evidence', () => {
    render(<PaceProfile splits={[{ ...run.splits[0]!, paceSecondsPerKm: NaN }]} plan={null} units="mi" />)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(screen.getByText(/Not enough recorded splits/)).toBeInTheDocument()
  })
})
