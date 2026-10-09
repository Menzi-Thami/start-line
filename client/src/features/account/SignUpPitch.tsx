interface Props {
  onSignUp: () => void
  onSignIn: () => void
}

// Only promise what's built. Anything on its way is labelled as such.
const REASONS = [
  {
    title: 'Built for your race',
    body: 'Any distance from a parkrun 5K to Comrades, with Two Oceans, the Cape Town Marathon and more already in. A 10K and an ultra are trained differently, so each gets its own plan.',
  },
  {
    title: 'Fits the days you can run',
    body: 'Pick three to seven days and your long-run day. Hard sessions are spread out so they don’t land back to back.',
  },
  {
    title: 'A pace and a reason for every run',
    body: 'Intervals, tempo, fartlek, hills, long runs: each one tells you how fast to go and what it’s for.',
  },
  {
    title: 'Builds you up without breaking you',
    body: 'It starts from what you run now, adds no more than 10% a week, eases off every fourth week and tapers you in fresh.',
  },
  {
    title: 'Yours on any device',
    body: 'Your plans are saved to your account. Add them to your calendar or print them for the fridge.',
  },
] as const

/** The first screen for a new runner: why Taperday, then sign up. */
export function SignUpPitch({ onSignUp, onSignIn }: Props) {
  return (
    <div className="pitch">
      <ul className="pitch-reasons">
        {REASONS.map((r) => (
          <li key={r.title}>
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
