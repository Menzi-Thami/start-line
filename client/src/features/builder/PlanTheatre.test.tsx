import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanTheatre } from './PlanTheatre'
import { SCENE_MS, TIPS } from './plan-theatre'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('the film during plan creation', () => {
  it('plays the story once, then keeps running laps', async () => {
    vi.useFakeTimers()
    const { container } = render(<PlanTheatre />)
    const seen: string[] = []
    for (let i = 0; i < 7; i++) {
      seen.push(container.querySelector('.wait-caption')!.textContent!)
      await act(() => vi.advanceTimersByTimeAsync(SCENE_MS))
    }
    expect(seen).toEqual(['Recovery is training', 'On your marks', 'And they’re off', 'Ticking off the kilometres', 'Through the tape', 'And they’re off', 'Ticking off the kilometres'])
    expect(container.querySelector('.wait-film')).toHaveAttribute('aria-hidden', 'true')
  })

  it('leaves a tip in place while the film plays and advances only when asked', async () => {
    vi.useFakeTimers()
    render(<PlanTheatre />)
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS * 3))
    expect(screen.getByRole('status')).toHaveTextContent(TIPS[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }))
    expect(screen.getByRole('status')).toHaveTextContent(TIPS[1]!)
  })

  it('focuses the loading heading and offers no playback controls', () => {
    render(<PlanTheatre />)
    expect(screen.getByRole('heading', { name: 'Building your plan…' })).toHaveFocus()
    expect(screen.queryByRole('button', { name: /pause|play animation/i })).toBeNull()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('keeps the scene still for reduced motion while tips remain usable', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.useFakeTimers()
    render(<PlanTheatre />)
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS * 3))
    expect(screen.getByText('Recovery is training')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Play animation' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pause animation' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next tip' }))
    expect(screen.getByRole('status')).toHaveTextContent(TIPS[1]!)
  })
})
