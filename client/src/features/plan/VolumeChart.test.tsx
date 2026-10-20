import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PlanWeek } from '../../lib/types'
import { weekLabels } from './plan-math'
import { VolumeChart } from './VolumeChart'

const week = (number: number, km: number, isCutback = false): PlanWeek => ({
  number,
  startDate: `2026-10-${String(12 + (number - 1) * 7).padStart(2, '0')}`,
  phase: 'Build',
  isCutback,
  plannedKm: km,
  sessions: [{ date: '2026-10-12', type: 'Easy', title: 'Easy', detail: '', purpose: '', distanceKm: km, zone: 'Easy', exercises: [] }],
})

const short = [week(1, 28.5), week(2, 35), week(3, 23.5, true), week(4, 11.5)]

describe('the weekly distance chart', () => {
  it('scales bars to a round top tick and labels each one in a short plan', () => {
    const { container } = render(<VolumeChart weeks={short} units="km" currentWeek={1} />)
    const bars = [...container.querySelectorAll<HTMLElement>('.volume-week')]

    expect(bars.map((b) => b.style.getPropertyValue('--h'))).toEqual(['81.42857142857143%', '100%', '67.14285714285714%', '32.857142857142854%'])
    expect([...container.querySelectorAll('.volume-value')].map((v) => v.textContent)).toEqual(['28.5', '35', '23.5', '11.5'])
    expect(container.querySelector('.volume-tick-label')?.textContent).toBe('35 km')
  })

  it('marks this week and hatches easier weeks', () => {
    const { container } = render(<VolumeChart weeks={short} units="km" currentWeek={1} />)
    const bars = [...container.querySelectorAll('.volume-week')]

    expect(bars[0]).toHaveClass('is-now')
    expect(bars.filter((b) => b.classList.contains('is-now'))).toHaveLength(1)
    expect(bars[2]).toHaveClass('is-cutback')
  })

  it('draws what was run on the same scale, and nothing for a week with no running yet', () => {
    const { container } = render(<VolumeChart weeks={short} units="km" currentWeek={2} ran={new Map([[1, 17.5], [2, 0]])} />)
    const bars = [...container.querySelectorAll<HTMLElement>('.volume-week')]

    expect(bars[0]!.querySelector('.volume-ran')).not.toBeNull()
    expect(bars[0]!.style.getPropertyValue('--r')).toBe('50%')
    expect(bars[1]!.querySelector('.volume-ran')).toBeNull()
    // This week says how far along it is.
    expect(bars[1]!.querySelector('.volume-value')?.textContent).toBe('0 / 35')
  })

  it('centres every number over its bar in short plans, and only pulls the end ones in when bars are narrow', () => {
    const { container } = render(<VolumeChart weeks={short} units="km" currentWeek={1} />)
    expect(container.querySelector('.volume-plot')).not.toHaveClass('is-dense')

    const long = Array.from({ length: 13 }, (_, i) => week(i + 1, 20 + i))
    const { container: dense } = render(<VolumeChart weeks={long} units="km" currentWeek={1} />)
    expect(dense.querySelector('.volume-plot')).toHaveClass('is-dense')
  })

  it('keeps week numbers apart in long plans', () => {
    for (const [count, current] of [[20, 1], [20, 2], [20, 19], [30, 7], [8, 3]] as const) {
      const shown = [...weekLabels(count, current)].sort((a, b) => a - b)
      const gap = count > 24 ? 4 : count > 12 ? 2 : 1
      expect(shown).toContain(current - 1)
      // The last week is labelled unless this week sits right beside it.
      if (count - current >= gap) expect(shown).toContain(count - 1)
      shown.slice(1).forEach((s, i) => expect(s - shown[i]!).toBeGreaterThanOrEqual(gap))
    }
  })
})
