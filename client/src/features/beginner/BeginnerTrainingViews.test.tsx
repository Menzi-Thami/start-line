import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { defaultBeginnerProgress } from './beginner-progress'
import { BeginnerCalendar, BeginnerProgress } from './BeginnerTrainingViews'

const progress = { ...defaultBeginnerProgress('2026-11-02'), completed: ['0:1:1'] }

describe('Couch to 5K navigation views', () => {
  it('opens the selected calendar week and labels provisional activities distinctly', () => {
    const select = vi.fn()
    render(<BeginnerCalendar progress={progress} recorded={new Set(['0:1:2'])} onChooseWeek={select} />)
    expect(screen.getByRole('button', { name: /Week 1, from 2026-11-02, 1 confirmed, 1 recorded via Strava/i })).toBeInTheDocument()
    expect(screen.getByText(/Recorded via Strava, not confirmed/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Week 2, from 2026-11-09/i }))
    expect(select).toHaveBeenCalledWith(2)
  })

  it('shows confirmed and provisional progress without inflating total completions', () => {
    render(<BeginnerProgress progress={progress} recorded={new Set(['0:1:1', '0:1:2'])} />)
    expect(screen.getByText('Confirmed workouts')).toBeInTheDocument()
    expect(screen.getByText('Recorded via Strava')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Week 1: 1 confirmed, 1 recorded via Strava, 1 scheduled' })).toBeInTheDocument()
    expect(screen.getByText(/don't judge whether you followed every interval/)).toBeInTheDocument()
  })
})
