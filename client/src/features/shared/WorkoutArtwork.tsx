import type { Session } from '../../lib/types'
import { Runner } from './Runner'
import './workout-artwork.css'

/** A quiet, original Taperday illustration; the workout's name always carries its meaning. */
export function WorkoutArtwork({ session, outside = false }: { session?: Session; outside?: boolean }) {
  const kind = outside ? 'outside' : !session ? 'rest' : session.type === 'Strength' ? 'strength' : session.type === 'Race' ? 'race' : (session.zone ?? 'Easy').toLowerCase()
  return <span className={`workout-artwork is-${kind}`} aria-hidden="true">
    <svg className="workout-artwork-track" viewBox="0 0 100 100" fill="none">
      <path d="M-20 100C-20 52 18 18 65 18H120M-20 100C-20 60 18 29 65 29H120M-20 100C-20 68 18 40 65 40H120" stroke="currentColor" />
    </svg>
    {kind === 'strength' ? <svg className="workout-artwork-strength" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"><path d="M13 24v16M22 18v28M42 18v28M51 24v16M22 32h20" /></svg>
      : <Runner pose={kind === 'rest' || kind === 'outside' ? 'sleep' : kind === 'race' ? 'victory' : kind === 'recovery' ? 'crouch' : 'sprint'} size={kind === 'rest' || kind === 'outside' ? 22 : 56} />}
  </span>
}
