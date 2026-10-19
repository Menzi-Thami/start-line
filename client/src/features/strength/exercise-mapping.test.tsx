import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import apiSchema from '../../lib/api-schema.ts?raw'
import type { Exercise, Session } from '../../lib/types'
import { EXERCISES, type ExerciseInfo } from './exercises'
import { ExerciseFigure } from './ExerciseFigure'
import { ExerciseList } from './ExerciseList'
import { figure, FLOOR, type PoseSpec } from './pose'

// Every exercise the API can send must have its own entry, its own figure and its own words. These tests fail if one
// is missing, if two share a figure, or if a pose doesn't do what the exercise's name says.

const fromApi = (): string[] => {
  const union = apiSchema.match(/^\s+Exercise: ((?:"\w+"(?: \| )?)+);$/m)?.[1]
  if (!union) throw new Error('Exercise enum not found in api-schema.ts; regenerate it with npm run gen:api')
  return [...union.matchAll(/"(\w+)"/g)].map((m) => m[1]!)
}

const all = Object.keys(EXERCISES) as Exercise[]
const onFloor = (y: number) => Math.abs(y - FLOOR) < 1
const hipDrop = (info: ExerciseInfo) => info.frames[1]!.hip[1] - info.frames[0].hip[1]
const onTopOf = (toe: readonly [number, number], prop: NonNullable<ExerciseInfo['prop']>) =>
  Math.abs(toe[1] - prop.y) <= 3 && toe[0] >= prop.x && toe[0] <= prop.x + prop.width
const everyFrame = (info: ExerciseInfo, check: (f: PoseSpec) => boolean) => info.frames.every(check)

/** What each figure has to show, in pose terms. A new exercise without an entry here fails the test below. */
const SHOWS: Record<Exercise, (info: ExerciseInfo) => boolean> = {
  Squat: (i) => i.frames.length === 2 && hipDrop(i) >= 12 && everyFrame(i, (f) => f.legs.every((l) => onFloor(l.toe[1]) && l.foot === 90)),
  RomanianDeadlift: (i) => i.weight === true && i.frames[1]!.lean >= 60 && Math.abs(hipDrop(i)) < 6,
  ReverseLunge: (i) => {
    const [up, down] = i.frames
    return down !== undefined && down.legs[1].toe[0] < down.hip[0] - 12 && down.legs[0].toe[0] === up.legs[0].toe[0] && hipDrop(i) >= 10
  },
  BulgarianSplitSquat: (i) => !!i.prop && everyFrame(i, (f) => onTopOf(f.legs[1].toe, i.prop!)) && hipDrop(i) >= 10,
  StepUp: (i) => !!i.prop && everyFrame(i, (f) => onTopOf(f.legs[0].toe, i.prop!)) && hipDrop(i) <= -8,
  GluteBridge: (i) => everyFrame(i, (f) => f.lean <= -60) && hipDrop(i) <= -10,
  CalfRaise: (i) => {
    const raised = i.frames[1]!
    return raised.legs.every((l) => onFloor(l.toe[1]) && l.foot < 70) && hipDrop(i) <= -3 && hipDrop(i) >= -8
  },
  Plank: (i) => i.frames.length === 1 && i.frames[0].lean >= 70 && i.frames[0].lean <= 100 && i.frames[0].legs.every((l) => onFloor(l.toe[1])),
  SidePlank: (i) => {
    const [hold] = i.frames
    const topArm = hold.arms[1].hand
    return i.frames.length === 1 && hold.lean >= 60 && hold.lean <= 90 && topArm !== 'hip' && topArm[1] < -15
  },
  SquatJump: (i) => {
    const [crouch, air] = i.frames
    return air !== undefined && crouch.hip[1] >= 65 && air.legs.every((l) => l.toe[1] < FLOOR - 1)
  },
}

describe('exercise mapping', () => {
  it('has exactly one entry for every exercise the API sends', () => {
    expect([...all].sort()).toEqual(fromApi().sort())
  })

  it.each(all)('%s is drawn doing that exercise', (exercise) => {
    expect(SHOWS[exercise](EXERCISES[exercise])).toBe(true)
  })

  it('never lets two exercises share a figure', () => {
    const signatures = all.map((e) => EXERCISES[e].frames.map((f) => JSON.stringify(figure(f))).join('|'))
    expect(new Set(signatures).size).toBe(all.length)
  })

  it('never lets two exercises share a name, how-to or cues', () => {
    for (const field of ['name', 'howTo', 'why'] as const) {
      expect(new Set(all.map((e) => EXERCISES[e][field])).size).toBe(all.length)
    }
    expect(new Set(all.map((e) => EXERCISES[e].cues.join('|'))).size).toBe(all.length)
  })

  it.each(all)('%s renders its own figure, not another one', (exercise) => {
    const { container } = render(<ExerciseFigure exercise={exercise} />)
    const svg = container.querySelector('svg')!
    expect(svg.dataset.exercise).toBe(exercise)

    const drawn = [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))
    const frames = EXERCISES[exercise].frames.map(figure)
    const working = frames.at(-1)!
    for (const d of [...working.legs, ...working.arms, working.torso]) expect(drawn).toContain(d)
    for (const other of all.filter((e) => e !== exercise)) {
      const theirs = EXERCISES[other].frames.map(figure).at(-1)!
      expect([...theirs.legs, ...theirs.arms, theirs.torso].every((d) => drawn.includes(d))).toBe(false)
    }
  })

  it('lists a session’s exercises in its order, each with its own number, figure, words and sets', () => {
    // Deliberately not catalogue order, so the list can only be right by following the session.
    const order: Exercise[] = ['SquatJump', 'Plank', 'BulgarianSplitSquat', 'Squat', 'SidePlank', 'CalfRaise', 'StepUp', 'GluteBridge', 'ReverseLunge', 'RomanianDeadlift']
    const session: Session = {
      date: '2026-10-19',
      type: 'Strength',
      title: 'Strength & mobility',
      detail: 'About 30 min.',
      purpose: '',
      distanceKm: 0,
      zone: null,
      exercises: order.map((exercise, i) => ({ exercise, sets: (i % 3) + 1, reps: 8, unit: 'Reps', summary: '' })),
    }
    const { getByRole } = render(<ExerciseList session={session} done={new Set()} onDoneChange={() => {}} />)

    const items = within(getByRole('list', { name: 'Strength & mobility: exercises in order' })).getAllByRole('listitem').filter((li) => li.dataset.exercise)
    expect(items.map((li) => li.dataset.exercise)).toEqual(order)
    items.forEach((li, i) => {
      const exercise = order[i]!
      const info = EXERCISES[exercise]
      expect(li.querySelector('.exercise-step')?.textContent).toBe(String(i + 1))
      expect((li.querySelector('svg') as SVGElement).dataset.exercise).toBe(exercise)
      expect(within(li).getByText(info.name)).toBeInTheDocument()
      expect(within(li).getByText(info.howTo)).toBeInTheDocument()
      info.cues.forEach((cue) => expect(within(li).getByText(cue)).toBeInTheDocument())
      expect(within(li).getAllByRole('checkbox')).toHaveLength((i % 3) + 1)
    })
  })
})
