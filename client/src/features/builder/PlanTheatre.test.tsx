import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlanTheatre } from './PlanTheatre'
import { SCENE_MS } from './plan-theatre'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('plan-generation loading scene', () => {
  it('announces genuine plan generation with no pause or tip controls', async () => {
    vi.useFakeTimers()
    const { container } = render(<PlanTheatre />)
    expect(screen.getByRole('status', { name: 'Building your training plan' })).toHaveTextContent('Making your plan.')
    expect(screen.getByText(/Your plan will open as soon as it's ready/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next tip|pause animation|play animation/i })).toBeNull()
    expect(container.querySelector('.plan-build-motion')).toHaveAttribute('aria-hidden', 'true')
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('respects reduced motion without showing controls', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
    vi.useFakeTimers()
    render(<PlanTheatre />)
    await act(() => vi.advanceTimersByTimeAsync(SCENE_MS * 3))
    expect(screen.getByText('Making your plan.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
