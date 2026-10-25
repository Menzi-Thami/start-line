import { useEffect, useState, type ReactNode } from 'react'
import { prefersMotion } from '../../lib/motion'
import { Runner } from '../shared/Runner'

interface Props {
  onSignUp: () => void
  onSignIn: () => void
}

// Long enough for one dash and three quips; short enough that nobody waits on it.
const DASH_MS = 1300
const QUIPS = ['Lacing up…', 'Finding the other sock…', 'Pretending to stretch…']

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const RUN_DAYS = new Set([1, 3, 5, 6])
const BUILD_UP = [30, 36, 42, 26, 46, 52, 60, 38, 64, 72, 80, 50, 34, 18]

// Each reason carries a small picture of itself: the real thing in miniature, not an illustration.
const REASONS: { title: string; body: string; mini: ReactNode; wide?: boolean }[] = [
  {
    title: 'Built for your race',
    body: 'Any distance, up to an ultra. Two Oceans, Comrades and more are already in.',
    mini: (
      <span className="mini-chips">
        {['5K', '10K', 'Half', 'Marathon', '56 km', '90 km'].map((d) => (
          <span key={d} className="mono">
            {d}
          </span>
        ))}
      </span>
    ),
    wide: true,
  },
  {
    title: 'Fits the days you can run',
    body: 'Pick your days and your long-run day.',
    mini: (
      <span className="mini-days">
        {DAYS.map((d, i) => (
          <span key={i} className={RUN_DAYS.has(i) ? 'is-on' : undefined}>
            {d}
          </span>
        ))}
      </span>
    ),
  },
  {
    title: 'A pace and a reason for every run',
    body: 'Every run has a pace and a purpose.',
    mini: (
      <span className="mini-paces">
        {[
          ['Easy', 55, 'var(--effort-easy)'],
          ['Tempo', 74, 'var(--effort-tempo)'],
          ['Intervals', 88, 'var(--effort-interval)'],
        ].map(([name, width, colour]) => (
          <span key={name as string}>
            <small>{name}</small>
            <i style={{ width: `${width}%`, background: colour as string }} />
          </span>
        ))}
      </span>
    ),
  },
  {
    title: 'Builds you up without breaking you',
    body: 'Builds up safely from what you run now, and tapers you in fresh.',
    mini: (
      <span className="mini-build">
        {BUILD_UP.map((h, i) => (
          <i key={i} className={i >= 12 ? 'is-taper' : (i + 1) % 4 === 0 ? 'is-easier' : undefined} style={{ height: `${h}%` }} />
        ))}
      </span>
    ),
  },
  {
    title: 'Yours on any device',
    body: 'Saved to your account. Add it to your calendar or print it.',
    mini: (
      <span className="mini-chips">
        {['Apple Calendar', 'Google', 'Outlook', 'Print'].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </span>
    ),
  },
]

/** The first screen for a new runner: why Taperday, as a bento of what you get, then sign up. */
export function SignUpPitch({ onSignUp, onSignIn }: Props) {
  // The runner dashes off to "the sign-up desk" before Microsoft's page loads. Without motion it's straight there.
  const [dashing, setDashing] = useState(false)

  useEffect(() => {
    if (!dashing) return
    const timer = window.setTimeout(onSignUp, DASH_MS)
    return () => window.clearTimeout(timer)
  }, [dashing, onSignUp])

  // Coming back with the browser's Back button can restore this page as it was left, mid-dash.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => event.persisted && setDashing(false)
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  const signUp = () => (prefersMotion() ? setDashing(true) : onSignUp())

  return (
    <div className="pitch">
      {dashing && (
        <div className="dash-off" role="status">
          <span className="visually-hidden">Taking you to sign up…</span>
          <span className="dash-off-track" aria-hidden="true">
            <Runner pose="sprint" size={48} className="dash-off-runner" />
          </span>
          <span className="dash-off-quips mono" aria-hidden="true">
            {QUIPS.map((q) => (
              <span key={q}>{q}</span>
            ))}
          </span>
        </div>
      )}
      <ul className="bento">
        {REASONS.map((r) => (
          <li key={r.title} className={r.wide ? 'bento-card bento-wide' : 'bento-card'}>
            <span className="bento-mini" aria-hidden="true">
              {r.mini}
            </span>
            <strong>{r.title}</strong>
            <span>{r.body}</span>
          </li>
        ))}
      </ul>

      <p className="pitch-soon">
        <span className="tag">Coming soon</span> A weekly email with how last week went and what’s next, and plans that adjust
        when you’re ill or miss a week.
      </p>

      <div className="pitch-actions">
        <button type="button" className={dashing ? 'button button-primary is-dashing' : 'button button-primary'} onClick={signUp} disabled={dashing}>
          Sign up free
        </button>
        <p className="field-help">We email you a code to sign in. No password to remember, no card needed.</p>
        <p>
          Already have an account?{' '}
          <button type="button" className="link-button" onClick={onSignIn}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  )
}
