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
    const { container } = render(<RunnerLoading label="Opening your training…" compact />)
    expect(screen.getByRole('status', { name: 'Opening your training…' })).toBeInTheDocument()
    expect(container.firstChild).toHaveClass('runner-loading-compact')
  })

  it('fades in late by default so fast loads never flash, unless asked to show at once', () => {
    const { container, rerender } = render(<RunnerLoading label="Opening your page…" />)
    expect(container.firstChild).not.toHaveClass('runner-loading-immediate')
    rerender(<RunnerLoading label="Opening your page…" immediate />)
    expect(container.firstChild).toHaveClass('runner-loading-immediate')
  })

  it('keeps retry and back controls out of the announced status', () => {
    render(<RunnerLoading label="Loading your runs…" actions={<button type="button">Try again</button>} />)
    expect(screen.getByRole('status')).not.toContainElement(screen.getByRole('button', { name: 'Try again' }))
  })
})
