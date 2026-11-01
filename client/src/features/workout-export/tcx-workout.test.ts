import { describe, expect, it } from 'vitest'
import type { Session } from '../../lib/types'
import { exportTcxWorkout, flattenWorkout } from './tcx-workout'

type Step = Session['steps'][number]
const segment = (kind: Step['kind'], distanceKm: number | null, durationSeconds: number | null): Step => ({
  kind, distanceKm, durationSeconds, zone: null, fastestSecondsPerKm: null,
  slowestSecondsPerKm: null, effort: null, times: 1, steps: [],
})
const session = (steps: Step[]): Session => ({
  date: '2026-11-03', type: 'Intervals', title: 'Intervals & <strides>', detail: '', purpose: '',
  distanceKm: 7, zone: null, exercises: [], steps, runWalk: null,
})

describe('structured TCX workout export', () => {
  it('expands nested repeats and preserves warmup/recovery order', () => {
    const repeat: Step = { ...segment('Repeat', null, null), times: 2,
      steps: [segment('Run', 0.4, null), segment('Recover', null, 90)] }
    const result = flattenWorkout([segment('WarmUp', null, 600), repeat, segment('CoolDown', 1, null)])
    expect(result.map(s => s.kind)).toEqual(['WarmUp', 'Run', 'Recover', 'Run', 'Recover', 'CoolDown'])
    const tcx = exportTcxWorkout(session([segment('WarmUp', null, 600), repeat]))
    expect(tcx).toContain('<Seconds>600</Seconds>')
    expect(tcx.match(/<Meters>400<\/Meters>/g)).toHaveLength(2)
    expect(tcx.match(/<Seconds>90<\/Seconds>/g)).toHaveLength(2)
    expect(tcx).toContain('<Workout Sport="Running">')
    expect(tcx).toContain('Intervals &amp; &lt;strides&gt;')
  })

  it('rejects empty and unbounded prescriptions rather than exporting garbage', () => {
    expect(() => exportTcxWorkout(session([]))).toThrow()
    expect(() => flattenWorkout([segment('Run', null, null)])).toThrow()
    expect(() => flattenWorkout([{ ...segment('Repeat', null, null), times: 0, steps: [segment('Run', 1, null)] }])).toThrow()
    expect(() => flattenWorkout([{ ...segment('Repeat', null, null), times: 101, steps: [segment('Run', 1, null)] }])).toThrow()
    expect(() => flattenWorkout([segment('Run', 1, null), segment('Run', 1, null)], 1)).toThrow()
  })
})
