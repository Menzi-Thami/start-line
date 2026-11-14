import type { RecoveryFeeling, RecoveryRedFlag } from './types'

export const FEELINGS: { value: RecoveryFeeling; label: string }[] = [
  { value: 'GoodToGo', label: 'Good to go' },
  { value: 'StillSore', label: 'Still sore' },
  { value: 'VeryFatigued', label: 'Very tired' },
  { value: 'PainOrInjury', label: 'Pain or injury' },
  { value: 'NotSure', label: 'Not sure' },
]

export const RED_FLAGS: { value: RecoveryRedFlag; label: string }[] = [
  { value: 'SeverePain', label: 'Severe or worsening pain' },
  { value: 'CannotWalkNormally', label: 'Can’t walk normally' },
  { value: 'MarkedSwelling', label: 'Marked swelling' },
  { value: 'DarkUrine', label: 'Dark or very little urine' },
  { value: 'Fainting', label: 'Fainting or dizziness' },
  { value: 'ChestPain', label: 'Chest pain or a racing heart' },
]

export const SAFETY_WORDS = 'Severe or lasting pain, trouble walking, marked swelling, dark urine, fainting or chest pain need a doctor or physio, today. For chest pain or fainting, call emergency services. Taperday won’t suggest any exercise while these are there.'

/** Orientation only, as the plan shows it: never a promise of when the runner is ready. */
export function framingFor(distanceKm: number): string {
  if (distanceKm <= 6) return 'After a 5K most runners feel fresh again in about 2–4 days.'
  if (distanceKm <= 12) return 'After a 10K most runners feel fresh again in about 3–7 days.'
  if (distanceKm <= 25) return 'After a half marathon, recovery usually takes about 7–14 days.'
  if (distanceKm <= 45) return 'After a marathon, recovery usually takes about 2–4 weeks.'
  return 'After an ultra, recovery is individual and often takes several weeks.'
}
