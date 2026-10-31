import { useEffect } from 'react'
import { Runner } from '../shared/Runner'

interface Props {
  onDone: () => void
}

const LETTERS = [
  { ch: 't', className: 'wl-1' },
  { ch: 'a', className: 'wl-2' },
  { ch: 'p', className: 'wl-3' },
  { ch: 'e', className: 'wl-4' },
  { ch: 'r', className: 'wl-5' },
]

/**
 * The opening: a runner on their marks, the starter's pistol, GO, a sprint across the screen with the wordmark
 * landing in their wake, then the curtain lifts. About 3.5 s, decorative only (hidden from screen readers), and a
 * tap or key press anywhere skips it. The caller decides whether it plays at all (once per visit, never for
 * reduced motion).
 */
export function RaceStartIntro({ onDone }: Props) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3600)
    document.addEventListener('pointerdown', onDone)
    document.addEventListener('keydown', onDone)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', onDone)
      document.removeEventListener('keydown', onDone)
    }
  }, [onDone])

  return (
    <div className="race-intro" aria-hidden="true">
      <div className="race-intro-call race-intro-set">SET</div>
      <div className="race-intro-call race-intro-go">GO!</div>

      <div className="race-intro-word">
        {LETTERS.map((l, i) => (
          <span key={l.ch} className={`race-intro-letter ${l.className}`} style={{ animationDelay: `${1720 + i * 110}ms` }}>
            {l.ch}
          </span>
        ))}
        <span className="race-intro-letter wordmark-accent" style={{ animationDelay: '2300ms' }}>
          day
        </span>
      </div>

      <div className="race-intro-track" />
      <div className="race-intro-startline" />

      <div className="race-intro-starter">
        <svg viewBox="0 -20 70 110" width="66" height="104" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="36" cy="10" r="7" fill="currentColor" stroke="none" />
          <path d="M34 20 L34 54" />
          <path d="M34 54 L27 88" />
          <path d="M34 54 L41 88" />
          <path d="M34 26 L45 22 L42 12" />
          <g className="race-intro-gun">
            <path d="M30 30 L30 54" />
            <path d="M30 54 L30 60 L36 60" />
          </g>
          <g className="race-intro-smoke">
            <circle cx="46" cy="2" r="9" fill="rgba(242,239,231,0.35)" stroke="none" />
          </g>
          <g className="race-intro-flash">
            <path d="M46 -14 L49 -2 L62 2 L49 6 L46 18 L43 6 L30 2 L43 -2 Z" fill="var(--accent)" stroke="none" />
          </g>
        </svg>
      </div>

      <div className="race-intro-crouch">
        <Runner pose="crouch" size={60} />
      </div>
      <div className="race-intro-screen-flash" />
      <div className="race-intro-sprinter">
        <Runner pose="sprint" size={96} />
      </div>
    </div>
  )
}
