import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RunSources } from './RunSources'

describe('where runs come from, in Account', () => {
  it('is honest about which connections exist today and which require a file', async () => {
    const onOpenRuns = vi.fn()
    render(<RunSources onOpenRuns={onOpenRuns} />)

    const sources = screen.getByRole('region', { name: 'Your runs, from anywhere' })
    expect(within(sources).getByText(/upload a .fit, .gpx or .tcx file/)).toBeInTheDocument()
    expect(within(sources).getByText(/Direct Apple Health or Health Connect access is not available in this web app/)).toBeInTheDocument()
    await userEvent.click(within(sources).getByRole('button', { name: 'See import options' }))
    expect(onOpenRuns).toHaveBeenCalled()
  })
})
