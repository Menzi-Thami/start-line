import type { DistanceCategory, PaceZone, TrainingPhase } from '../../lib/types'

export const ZONES: Record<PaceZone, { name: string; note: string; colour: string }> = {
  Recovery: { name: 'Recovery', note: 'Slower than easy. Just loosening up after a hard day.', colour: 'var(--effort-recovery)' },
  Easy: { name: 'Easy', note: 'Chatty pace. Most of your running lives here.', colour: 'var(--effort-easy)' },
  LongRun: { name: 'Long run', note: 'Steady and patient. Time on your feet matters more than speed.', colour: 'var(--effort-long)' },
  Tempo: { name: 'Tempo', note: 'Comfortably hard. You can say a few words, not a sentence.', colour: 'var(--effort-tempo)' },
  Interval: { name: 'Interval', note: 'Hard, in short reps with recovery between.', colour: 'var(--effort-interval)' },
  Race: { name: 'Race pace', note: 'Your goal pace on the day.', colour: 'var(--effort-race)' },
}

export const PHASES: Record<TrainingPhase, string> = {
  Base: 'Base',
  Build: 'Build',
  Peak: 'Peak',
  Taper: 'Taper',
  RaceWeek: 'Race week',
}

export const FOCUS: Record<DistanceCategory, string> = {
  FiveK: 'A 5K rewards speed, so the hard days are short intervals, hills and strides, and the long runs stay modest.',
  TenK: 'A 10K needs speed and stamina: 1 km reps, tempo runs and blocks at goal pace.',
  HalfMarathon: 'The half is a threshold race. Expect tempo runs, cruise intervals and long stretches at goal pace.',
  Marathon: 'The marathon is endurance at pace: cruise intervals, marathon-pace runs and long runs that rehearse race day.',
  Ultra: 'Ultras are won on time on your feet: back-to-back weekends, long hills and practising what you eat on the run.',
  LongUltra:
    'The longest races need the most patience: back-to-back weekends, long climbs and descents, and a build that never rushes.',
}
