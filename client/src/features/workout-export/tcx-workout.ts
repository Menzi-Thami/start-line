import type { Session } from '../../lib/types'

/**
 * Training Center XML workout export. Emits ordered steps and expands repeat blocks.
 * It intentionally does not promise Garmin Connect import or transfer to a device:
 * acceptance must be verified against a real destination before enabling that claim.
 */
type Step = Session['steps'][number]
type Flat = { kind: Step['kind']; distanceKm: number | null; durationSeconds: number | null; fastestSecondsPerKm: number | null; slowestSecondsPerKm: number | null; effort: string | null }
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const positive = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0
const meters = (n: number) => Math.round(n * 1000)
const seconds = (n: number) => Math.round(n)

/** Protect exports from malformed, recursive or unreasonably large prescriptions. */
export function flattenWorkout(steps: Step[], limit = 500): Flat[] {
  const result: Flat[] = []
  const visit = (items: Step[], depth: number) => {
    if (depth > 8) throw new Error('Workout has too many nested repeat blocks.')
    for (const step of items) {
      if (step.kind === 'Repeat') {
        if (!Number.isInteger(step.times) || step.times < 1 || step.times > 100 || step.steps.length === 0)
          throw new Error('Invalid workout repeat count.')
        for (let i = 0; i < step.times; i++) visit(step.steps, depth + 1)
      } else {
        if (!positive(step.durationSeconds) && !positive(step.distanceKm)) throw new Error('Workout step requires a distance or duration.')
        // TCX stores whole seconds/metres: never emit a zero-length step after rounding.
        const timeWins = positive(step.durationSeconds)
        const exportable = timeWins ? seconds(step.durationSeconds!) >= 1 : meters(step.distanceKm!) >= 1
        if (!exportable) throw new Error('Workout step is too short to export as whole seconds or metres.')
        if ((step.durationSeconds !== null && (!Number.isFinite(step.durationSeconds) || step.durationSeconds < 0)) ||
            (step.distanceKm !== null && (!Number.isFinite(step.distanceKm) || step.distanceKm < 0)))
          throw new Error('Workout has an invalid step measurement.')
        if (result.length >= limit) throw new Error('Workout exceeds the supported step limit.')
        result.push({ kind: step.kind, distanceKm: step.distanceKm, durationSeconds: step.durationSeconds,
          fastestSecondsPerKm: step.fastestSecondsPerKm, slowestSecondsPerKm: step.slowestSecondsPerKm, effort: step.effort })
      }
    }
  }
  visit(steps, 0)
  if (result.length === 0) throw new Error('Workout has no exportable steps.')
  return result
}

export function exportTcxWorkout(session: Session): string {
  if (!session.steps.length || session.type === 'Strength') throw new Error('This session has no structured running workout.')
  const steps = flattenWorkout(session.steps)
  // Preserve prescribed pace as human-readable guidance. TCX's typed Speed_t targets
  // need destination-specific validation before we can safely emit them.
  const pace = (value: number): string => {
    const whole = Math.round(value)
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}/km`
  }
  const notes = steps.map((step, i) => {
    const target = step.fastestSecondsPerKm !== null && step.slowestSecondsPerKm !== null
      && Number.isFinite(step.fastestSecondsPerKm) && step.fastestSecondsPerKm > 0
      && Number.isFinite(step.slowestSecondsPerKm) && step.slowestSecondsPerKm > 0
      ? ` · pace ${pace(step.fastestSecondsPerKm)}–${pace(step.slowestSecondsPerKm)}` : ''
    return `${i + 1}. ${step.kind}${target}${step.effort ? ': ' + step.effort : ''}`
  }).join('; ')
  const body = steps.map((step, index) => {
    // Duration wins if both are supplied: a TCX step can have exactly one duration type.
    const duration = positive(step.durationSeconds)
      ? `<Duration xsi:type="Time_t"><Seconds>${seconds(step.durationSeconds)}</Seconds></Duration>`
      : `<Duration xsi:type="Distance_t"><Meters>${meters(step.distanceKm!)}</Meters></Duration>`
    const intensity = step.kind === 'Recover' || step.kind === 'CoolDown' ? 'Resting' : 'Active'
    return `<Step xsi:type="Step_t"><StepId>${index + 1}</StepId><Name>${xml(step.kind)}</Name>${duration}<Intensity>${intensity}</Intensity><Target xsi:type="None_t"/></Step>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Workouts><Workout Sport="Running"><Name>${xml(session.title)}</Name>${body}<Notes>${xml(notes)}</Notes></Workout></Workouts></TrainingCenterDatabase>`
}
