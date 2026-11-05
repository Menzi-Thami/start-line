import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanTheatre } from './PlanTheatre'
import { SCENE_MS } from './plan-theatre'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Taperday runner film during plan generation', () => {
  it('plays the original five scenes, then keeps running', async () => {
    vi.useFakeTimers()
    const { container } = render(<PlanTheatre />)
    const seen: string[] = []
    for (let i = 0; i < 7; i++) {
      seen.push(container.querySelector('.wait-caption')!.textContent!)
      await act(() => vi.advanceTimersByTimeAsync(SCENE_MS))
    }
    expect(seen).toEqual([
      'Recovery is training', 'On your marks', 'And they’re off',
      'Ticking off the kilometres', 'Through the tape',
      'And they’re off', 'Ticking off the kilometres',
    ])
    expect(container.querySelector('.wait-film')).toHaveAttribute('aria-hidden', 'true')
  })

  it('shows a clear loading state without tips or pause controls', () => {
    render(<PlanTheatre />)
    expect(screen.getByRole('status', { name: 'Building your training plan' })).toBeInTheDocument()
    expect(screen.getByText('Building your plan…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next tip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pause animation' })).not.toBeInTheDocument()
  })

  it('holds a static finish-line pose for reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    vi.useFakeTimers()
    const { container } = render(<PlanTheatre />)
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS * 3))
    expect(container.querySelector('.wait-scene-finish')).toBeInTheDocument()
    expect(screen.getByText('Building your plan…')).toBeInTheDocument()
  })
})
