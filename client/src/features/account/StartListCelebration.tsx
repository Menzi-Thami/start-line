import { useEffect, type CSSProperties } from 'react'
import { Runner } from '../shared/Runner'

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 7) * 90}ms`,
  duration: `${1400 + (i % 5) * 180}ms`,
}))

interface Props {
  name: string
  onDone: () => void
}

/**
 * The moment a sign-up finishes: pins pop in, confetti falls and the runner hops. It sits over the page without
 * blocking it (the next question is already there underneath) and clears itself.
 */
export function StartListCelebration({ name, onDone }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return (
    <div className="start-list" role="status">
      <span className="start-list-confetti" aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <i key={i} style={{ left: c.left, animationDelay: c.delay, animationDuration: c.duration } as CSSProperties} />
        ))}
      </span>
      <div className="start-list-card">
        <span className="start-list-pin start-list-pin-left" aria-hidden="true" />
        <span className="start-list-pin start-list-pin-right" aria-hidden="true" />
        <Runner pose="victory" size={56} />
        <p className="start-list-title">You’re on the start list!</p>
        <p className="start-list-name">Welcome, {name}. Now, which race?</p>
      </div>
    </div>
  )
}
