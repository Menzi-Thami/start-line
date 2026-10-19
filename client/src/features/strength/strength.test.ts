import { describe, expect, it } from 'vitest'
import type { Exercise, Session } from '../../lib/types'
import { EXERCISES, formatDose } from './exercises'
import { figure, solveLimb, VIEW } from './pose'
import { setsDone, withSessionDone, withSetDone } from './strength-progress'

const numbers = (d: string) => [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
const points = (d: string) => {
  const n = numbers(d)
  return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i]!, n[2 * i + 1]!] as const)
}
const lengths = (d: string) => {
  const p = points(d)
  return p.slice(1).map((q, i) => Math.hypot(q[0] - p[i]![0], q[1] - p[i]![1]))
}

describe('the strength figures', () => {
  const all = Object.entries(EXERCISES) as [Exercise, (typeof EXERCISES)[Exercise]][]

  it.each(all)('%s keeps every limb the same length in every frame, so the animation never stretches', (_, info) => {
    const frames = info.frames.map(figure)
    const first = frames[0]!
    for (const f of frames) {
      for (const [a, b] of [
        [f.legs[0], first.legs[0]],
        [f.legs[1], first.legs[1]],
        [f.arms[0], first.arms[0]],
        [f.torso, first.torso],
      ] as const) {
        lengths(a).forEach((len, i) => expect(len).toBeCloseTo(lengths(b)[i]!, 0))
      }
    }
  })

  it.each(all)('%s puts the feet where the pose asks and stays inside the picture', (_, info) => {
    for (const [spec, f] of info.frames.map((s) => [s, figure(s)] as const)) {
      f.legs.forEach((leg, i) => {
        const toe = points(leg).at(-1)!
        expect(toe[0]).toBeCloseTo(spec.legs[i]!.toe[0], 0)
        expect(toe[1]).toBeCloseTo(spec.legs[i]!.toe[1], 0)
      })
      for (const d of [...f.legs, ...f.arms, f.torso]) {
        for (const [x, y] of points(d)) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(VIEW.width)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(VIEW.height)
        }
      }
      expect(f.head[1] - 7).toBeGreaterThanOrEqual(0)
    }
  })

  it('bends a knee the way it is asked to', () => {
    const forward = solveLimb([50, 50], [50, 80], 17, 17, 'forward').joint
    const back = solveLimb([50, 50], [50, 80], 17, 17, 'back').joint
    expect(forward[0]).toBeGreaterThan(50)
    expect(back[0]).toBeLessThan(50)
  })

  it('every move has cues and a reason', () => {
    for (const info of Object.values(EXERCISES)) {
      expect(info.cues.length).toBeGreaterThanOrEqual(3)
      expect(info.why).not.toBe('')
    }
  })
})

describe('sets and reps', () => {
  it('reads like a runner would write it', () => {
    expect(formatDose({ exercise: 'Squat', sets: 3, reps: 10, unit: 'Reps' })).toBe('3 × 10')
    expect(formatDose({ exercise: 'ReverseLunge', sets: 3, reps: 8, unit: 'RepsEachLeg' })).toBe('3 × 8 each leg')
    expect(formatDose({ exercise: 'Plank', sets: 3, reps: 30, unit: 'Seconds' })).toBe('3 × 30 s')
    expect(formatDose({ exercise: 'SidePlank', sets: 2, reps: 30, unit: 'SecondsEachSide' })).toBe('2 × 30 s each side')
  })
})

describe('ticking off strength', () => {
  const session: Session = {
    date: '2026-10-12',
    type: 'Strength',
    title: 'Strength & mobility',
    detail: '',
    purpose: '',
    distanceKm: 0,
    zone: null,
    exercises: [
      { exercise: 'Squat', sets: 2, reps: 10, unit: 'Reps' },
      { exercise: 'Plank', sets: 1, reps: 30, unit: 'Seconds' },
    ],
  }

  it('marks the session done when its last set is ticked, and not done again when one is unticked', () => {
    let done = new Set<string>()
    done = withSetDone(done, session, 'Squat', 0, true)
    done = withSetDone(done, session, 'Squat', 1, true)
    expect(done.has('2026-10-12|Strength')).toBe(false)

    done = withSetDone(done, session, 'Plank', 0, true)
    expect(done.has('2026-10-12|Strength')).toBe(true)
    expect(setsDone(done, session)).toEqual({ done: 3, total: 3 })

    done = withSetDone(done, session, 'Squat', 0, false)
    expect(done.has('2026-10-12|Strength')).toBe(false)
  })

  it('ticks and clears every set with the session', () => {
    const ticked = withSessionDone(new Set(['other|Easy']), session, true)
    expect(setsDone(ticked, session)).toEqual({ done: 3, total: 3 })

    const cleared = withSessionDone(ticked, session, false)
    expect([...cleared]).toEqual(['other|Easy'])
  })

  it('leaves a run as a single tick', () => {
    const run: Session = { ...session, type: 'Easy', exercises: [] }
    expect([...withSessionDone(new Set(), run, true)]).toEqual(['2026-10-12|Easy'])
  })
})
