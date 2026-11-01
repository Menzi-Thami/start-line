import type { CoachVerdict } from '../../lib/types'

/** Each weekly call's headline, shared by the coach's note and the coaching history. */
export const TITLES: Record<CoachVerdict, string> = {
  NotEnoughToGoOn: 'Tell me how your runs go',
  OnTrack: 'On track',
  Struggling: 'An easier week',
  Hurting: 'Look after that first',
  Thriving: 'Strong week',
}
