import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RunnerLoading } from './RunnerLoading'

describe('Taperday runner loading state', () => {
  it('announces the real pending activity instead of showing an unlabeled spinner', () => {
    render(<RunnerLoading label="Loading your run…" detail="Opening your recording and analysis." />)
    expect(screen.getByRole('status', { name: 'Loading your run…' })).toHaveTextContent('Opening your recording and analysis.')
    expect(document.querySelector('.runner-sprint')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.runner-loading-track')).toBeInTheDocument()
  })

  it('fits inline waits without taking over the screen', () => {
    render(<RunnerLoading label="Opening your training…" compact />)
    expect(screen.getByRole('status', { name: 'Opening your training…' })).toHaveClass('runner-loading-compact')
  })
})
