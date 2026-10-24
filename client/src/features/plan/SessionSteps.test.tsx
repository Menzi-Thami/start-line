import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { formatStepTime, stepText } from '../../lib/session-steps'
import type { SessionStep } from '../../lib/types'
import { SessionSteps } from './SessionSteps'

const step = (overrides: Partial<SessionStep>): SessionStep => ({
  kind: 'Run',
  distanceKm: null,
  durationSeconds: null,
  zone: null,
  fastestSecondsPerKm: null,
  slowestSecondsPerKm: null,
  effort: null,
  times: 1,
  steps: [],
  ...overrides,
})

// 5 × 800 m at interval pace with 90 s jog, between a 2 km warm-up and a 1.5 km cool-down.
const intervals: SessionStep[] = [
  step({ kind: 'WarmUp', distanceKm: 2, zone: 'Easy', fastestSecondsPerKm: 372, slowestSecondsPerKm: 405 }),
  step({
    kind: 'Repeat',
    times: 5,
    steps: [
      step({ distanceKm: 0.8, zone: 'Interval', fastestSecondsPerKm: 298, slowestSecondsPerKm: 310 }),
      step({ kind: 'Recover', durationSeconds: 90, effort: 'Easy jog' }),
    ],
  }),
  step({ kind: 'CoolDown', distanceKm: 1.5, zone: 'Easy', fastestSecondsPerKm: 372, slowestSecondsPerKm: 405 }),
]

describe('a session, step by step', () => {
  it('reads like a coach: warm up, the reps with their jog, cool down, each at its pace', () => {
    render(<SessionSteps steps={intervals} units="km" />)

    const list = screen.getAllByRole('list')[0]!
    const items = within(list).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Warm up: 2 km easy · 6:12–6:45/km')
    expect(items[1]).toHaveTextContent(/^Repeat 5 times:/)
    expect(within(items[1]!).getByText('800 m at interval pace · 4:58–5:10/km')).toBeInTheDocument()
    expect(within(items[1]!).getByText('90 s easy jog')).toBeInTheDocument()
    expect(screen.getByText('Cool down: 1.5 km easy · 6:12–6:45/km')).toBeInTheDocument()
  })

  it('gives a tempo by time, and hills and strides by feel', () => {
    expect(stepText(step({ durationSeconds: 1200, zone: 'Tempo', fastestSecondsPerKm: 310, slowestSecondsPerKm: 320 }), 'km')).toBe(
      '20 min at tempo pace · 5:10–5:20/km',
    )
    expect(stepText(step({ durationSeconds: 60, zone: 'Interval', effort: 'Uphill, hard but controlled' }), 'km')).toBe('60 s: uphill, hard but controlled')
    expect(stepText(step({ kind: 'Recover', effort: 'Jog back down' }), 'km')).toBe('Jog back down')
    expect(stepText(step({ durationSeconds: 20, effort: 'Stride: quick and relaxed' }), 'km')).toBe('20 s: stride: quick and relaxed')
  })

  it('gives every hard bit and every jog a pace to hold on a watch', () => {
    expect(
      stepText(step({ durationSeconds: 60, zone: 'Interval', fastestSecondsPerKm: 280, slowestSecondsPerKm: 290, effort: 'Hard' }), 'km'),
    ).toBe('60 s at interval pace (hard) · 4:40–4:50/km')
    expect(
      stepText(step({ kind: 'Recover', durationSeconds: 60, zone: 'Recovery', fastestSecondsPerKm: 370, slowestSecondsPerKm: 400, effort: 'Easy' }), 'km'),
    ).toBe('60 s easy · 6:10–6:40/km')
    expect(stepText(step({ kind: 'Recover', durationSeconds: 60, effort: 'Walk back' }), 'km')).toBe('60 s walk back')
  })

  it('speaks miles to runners who use them', () => {
    expect(stepText(step({ distanceKm: 1.609344, zone: 'Race', fastestSecondsPerKm: 300, slowestSecondsPerKm: 300 }), 'mi')).toBe('1 mi at race pace · 8:03/mi')
  })

  it('says a time the way a runner would', () => {
    expect([30, 60, 90, 120, 150, 1500, 3900].map(formatStepTime)).toEqual(['30 s', '60 s', '90 s', '2 min', '2.5 min', '25 min', '1 h 5 min'])
  })

  it('adds nothing to a plain run, which already shows its distance and pace', () => {
    const { container } = render(<SessionSteps steps={[step({ distanceKm: 8, zone: 'Easy', fastestSecondsPerKm: 372, slowestSecondsPerKm: 405 })]} units="km" />)

    expect(container).toBeEmptyDOMElement()
  })

  it('copes with a plan saved before sessions had steps', () => {
    const { container } = render(<SessionSteps units="km" />)

    expect(container).toBeEmptyDOMElement()
  })
})
