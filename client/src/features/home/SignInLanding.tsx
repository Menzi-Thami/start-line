interface Props {
  onSignIn: () => void
  onSignUp: () => void
  onBack: () => void
}

/** A focused account entry; the identity provider still handles all credentials. */
export function SignInLanding({ onSignIn, onSignUp, onBack }: Props) {
  return (
    <section className="sign-in-landing" aria-labelledby="sign-in-landing-title">
      <div className="sign-in-landing-card">
        <p className="sign-in-eyebrow">Welcome back</p>
        <h1 id="sign-in-landing-title">Your next run starts here.</h1>
        <p className="sign-in-lede">Pick up your training plan, review your runs and see what comes next.</p>
        <div className="sign-in-actions">
          <button type="button" className="button button-primary" onClick={onSignIn}>Continue to sign in</button>
          <button type="button" className="button button-quiet" onClick={onSignUp}>Create an account</button>
        </div>
        <button type="button" className="link-button" onClick={onBack}>Back to Taperday</button>
      </div>
    </section>
  )
}
