import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Runner } from '../shared/Runner'

// Volt, sage and ink pieces that drift down for a moment: no flashing, no strobe, and none at all with reduced motion.
const CONFETTI = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  delay: `${900 + (i % 6) * 110}ms`,
  duration: `${1600 + (i % 5) * 220}ms`,
  tone: i % 3,
}))

export interface FilmProps {
  variant: 'training' | 'race'
  /** "YOU DID IT." for training; the race's own words for a race. */
  heading: string
  lede: string
  raceName: string
  metrics: { value: string; label: string }[]
  primaryLabel: string
  onPrimary: () => void
  onClose: () => void
  /** Where focus goes afterwards. Needed in Safari, which doesn't focus a button when it's clicked. */
  returnFocus?: () => HTMLElement | null | undefined
}

/**
 * The Finish Line moment, in five beats: the runner comes in along the course, breaks the tape (a medal swings in for a
 * race instead), a little confetti, "YOU DID IT." with the saved numbers, then the way on. It's a real dialog: focus
 * moves in and stays in, Escape or Close leaves at any time, the page behind doesn't scroll, and focus goes back to
 * where it was. With reduced motion every beat is simply there, still.
 */
export function FinishLineFilm({ variant, heading, lede, raceName, metrics, primaryLabel, onPrimary, onClose, returnFocus }: FilmProps) {
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  const primary = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  const back = useRef(returnFocus)
  useLayoutEffect(() => { close.current = onClose; back.current = returnFocus })

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    primary.current?.focus({ preventScroll: true })
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
        return
      }
      if (event.key !== 'Tab') return
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [href]')
      if (!controls?.length) return
      const first = controls[0]!
      const last = controls[controls.length - 1]!
      if (!dialog.current?.contains(document.activeElement)) { event.preventDefault(); first.focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      const target = back.current?.() ?? (previous && previous !== document.body ? previous : null)
      target?.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div className={`finish-film is-${variant}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
      <div className="finish-film-stage">
        <button type="button" className="finish-film-close button button-quiet" onClick={onClose} aria-label="Close the Finish Line">Close</button>
        <p className="finish-film-kicker">Taperday · {variant === 'race' ? 'Race finished' : 'Finish line'}</p>
        <div className="finish-film-course" aria-hidden="true">
          <span className="finish-film-confetti">
            {CONFETTI.map((piece, i) => (
              <i key={i} className={`tone-${piece.tone}`} style={{ left: piece.left, animationDelay: piece.delay, animationDuration: piece.duration } as CSSProperties} />
            ))}
          </span>
          {variant === 'training' ? (
            <>
              <span className="finish-film-post is-left" />
              <span className="finish-film-tape is-left" />
              <span className="finish-film-tape is-right" />
              <span className="finish-film-post is-right" />
              <span className="finish-film-runner"><Runner pose="victory" size={96} /></span>
            </>
          ) : (
            <>
              <span className="finish-film-medal"><span className="finish-film-ribbon" /><span className="finish-film-disc">★</span></span>
              <span className="finish-film-runner is-still"><Runner pose="victory" size={96} /></span>
            </>
          )}
          <span className="finish-film-ground" />
        </div>
        <h2 id={titleId} className="finish-film-title">{heading}</h2>
        <p className="finish-film-lede">{lede}</p>
        <p className="finish-film-race">{raceName}</p>
        {metrics.length > 0 && (
          <dl className="finish-film-metrics">
            {metrics.map(metric => (
              <div key={metric.label}><dt>{metric.label}</dt><dd className="mono">{metric.value}</dd></div>
            ))}
          </dl>
        )}
        <div className="finish-film-actions">
          <button ref={primary} type="button" className="button button-primary" onClick={onPrimary}>{primaryLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
