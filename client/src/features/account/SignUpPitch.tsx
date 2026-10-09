import type { ReactNode } from 'react'

interface Props {
  onSignUp: () => void
  onSignIn: () => void
}

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const RUN_DAYS = new Set([1, 3, 5, 6])
const BUILD_UP = [30, 36, 42, 26, 46, 52, 60, 38, 64, 72, 80, 50, 34, 18]

// Each reason carries a small picture of itself: the real thing in miniature, not an illustration.
const REASONS: { title: string; body: string; mini: ReactNode; wide?: boolean }[] = [
  {
    title: 'Built for your race',
    body: 'Any distance from a parkrun 5K to Comrades, with Two Oceans, the Cape Town Marathon and more already in. A 10K and an ultra are trained differently, so each gets its own plan.',
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
    body: 'Pick three to seven days and your long-run day. Hard sessions are spread out so they don’t land back to back.',
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
    body: 'Intervals, tempo, fartlek, hills, long runs: each one tells you how fast to go and what it’s for.',
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
    body: 'It starts from what you run now, adds no more than 10% a week, eases off every fourth week and tapers you in fresh.',
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
    body: 'Your plans are saved to your account. Add them to your phone’s calendar or print them for the fridge.',
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
  return (
    <div className="pitch">
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
        <button type="button" className="button button-primary" onClick={onSignUp}>
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
