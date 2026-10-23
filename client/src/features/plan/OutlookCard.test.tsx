import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { GoalOutlook, GoalVerdict } from '../../lib/types'
import { OutlookCard } from './OutlookCard'

const outlook = (overrides: Partial<GoalOutlook> = {}): GoalOutlook => ({
  verdict: 'OnTrack',
  summary: '3:47:00 looks realistic for this race.',
  reasons: [
    { code: 'build-enough', message: 'The plan builds to 67 km a week at its peak: enough.' },
    { code: 'fitness-today', message: 'Your 10 km in 50:00 points to about 3:50:35 for this race today.' },
  ],
  suggestedGoal: null,
  fitnessToday: '03:50:35',
  ...overrides,
})

describe('the goal outlook', () => {
  it.each<[GoalVerdict, string]>([
    ['NotAssessed', 'About your goal'],
    ['AheadOfGoal', 'You could aim higher'],
    ['OnTrack', 'Your goal looks realistic'],
    ['Stretch', 'Your goal is a stretch'],
    ['AtRisk', 'Your goal is at risk'],
  ])('says %s in words, not only in colour', (verdict, heading) => {
    render(<OutlookCard outlook={outlook({ verdict })} />)

    expect(screen.getByRole('region', { name: heading })).toBeInTheDocument()
    expect(screen.getByText('3:47:00 looks realistic for this race.')).toBeInTheDocument()
  })

  it('gives the reasons behind the verdict', () => {
    render(<OutlookCard outlook={outlook()} />)

    expect(screen.getByText('The plan builds to 67 km a week at its peak: enough.')).toBeInTheDocument()
    expect(screen.getByText('Your 10 km in 50:00 points to about 3:50:35 for this race today.')).toBeInTheDocument()
  })

  it.each<[GoalVerdict, boolean]>([
    ['AheadOfGoal', true],
    ['AtRisk', true],
    ['OnTrack', false],
    ['Stretch', false],
    ['NotAssessed', false],
  ])('%s: the reasons start open only when the news asks for a decision (%s)', (verdict, open) => {
    const { container } = render(<OutlookCard outlook={outlook({ verdict })} />)

    expect(container.querySelector('details')?.open).toBe(open)
  })

  it('offers the faster goal when the runner is ahead of theirs, and takes it on a tap', async () => {
    const onUseGoal = vi.fn()
    render(<OutlookCard outlook={outlook({ verdict: 'AheadOfGoal', suggestedGoal: '03:44:00' })} onUseGoal={onUseGoal} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Use 3:44:00 as my goal' }))

    expect(onUseGoal).toHaveBeenCalledWith(13440)
  })

  it('offers the more realistic goal when the goal is at risk', async () => {
    const onUseGoal = vi.fn()
    render(<OutlookCard outlook={outlook({ verdict: 'AtRisk', suggestedGoal: '03:44:00' })} onUseGoal={onUseGoal} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Use 3:44:00 as my goal' }))

    expect(onUseGoal).toHaveBeenCalledWith(13440)
  })

  it('only tells the suggestion when nothing can take it (a rebuilt plan’s banner already does)', () => {
    render(<OutlookCard outlook={outlook({ verdict: 'AtRisk', suggestedGoal: '03:44:00' })} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('has no button when there is nothing to suggest', () => {
    render(<OutlookCard outlook={outlook({ verdict: 'Stretch' })} onUseGoal={vi.fn()} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
