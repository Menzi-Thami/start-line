import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RUN_MS, StepRail, type RailStep } from './StepRail'

const steps: RailStep[] = [
  { label: 'Race', icon: 'race' },
  { label: 'Goal', icon: 'goal' },
  { label: 'Days', icon: 'days' },
  { label: 'Review', icon: 'finish' },
]

const runner = (container: HTMLElement) => container.querySelector('.step-rail-runner')!

function motion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {} }))
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StepRail', () => {
  it('marks done, current and coming steps, with only the current one announced as the step', () => {
    render(<StepRail steps={steps} current={2} />)
    const items = within(screen.getByRole('list', { name: 'Plan builder steps' })).getAllByRole('listitem')
    expect(items.map((item) => item.className.match(/is-(done|now|next)/)![1])).toEqual(['done', 'done', 'now', 'next'])
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items.filter((item) => item.hasAttribute('aria-current'))).toHaveLength(1)
  })

  it('lets a runner tap a done step to go back, but not the current or a later one', async () => {
    const pick = vi.fn()
    render(<StepRail steps={steps} current={2} onPick={pick} />)
    await userEvent.click(screen.getByRole('button', { name: 'Back to race' }))
    expect(pick).toHaveBeenCalledWith(0)
    expect(screen.getByRole('button', { name: 'Back to goal' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to days' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Back to review' })).not.toBeInTheDocument()
  })

  it('keeps steps that canPick refuses as plain markers', () => {
    render(<StepRail steps={steps} current={2} onPick={() => {}} canPick={(i) => i > 0} />)
    expect(screen.queryByRole('button', { name: 'Back to race' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to goal' })).toBeInTheDocument()
  })

  it('sprints to the next marker, then stands; runs the other way going back', () => {
    motion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(<StepRail steps={steps} current={0} />)
    expect(runner(container)).not.toHaveClass('is-moving')

    rerender(<StepRail steps={steps} current={1} />)
    expect(runner(container)).toHaveClass('is-moving', 'is-forward')
    act(() => { vi.advanceTimersByTime(RUN_MS) })
    expect(runner(container)).not.toHaveClass('is-moving')

    rerender(<StepRail steps={steps} current={0} />)
    expect(runner(container)).toHaveClass('is-moving', 'is-back')
  })

  it('throws its arms up at the finish once it has arrived', () => {
    motion(false)
    vi.useFakeTimers()
    const { container, rerender } = render(<StepRail steps={steps} current={2} />)
    rerender(<StepRail steps={steps} current={3} />)
    expect(container.querySelector('.runner-sprint')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(RUN_MS) })
    expect(container.querySelector('.runner-victory')).toBeInTheDocument()
  })

  it('moves without running when the runner asked for less motion', () => {
    motion(true)
    const { container, rerender } = render(<StepRail steps={steps} current={0} />)
    rerender(<StepRail steps={steps} current={1} />)
    expect(runner(container)).not.toHaveClass('is-moving')
    expect(container.querySelector<HTMLElement>('.step-rail')!.style.getPropertyValue('--rail-at')).toBe(String(1 / 3))
  })
})
