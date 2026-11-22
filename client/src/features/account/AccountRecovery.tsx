import { Runner } from '../shared/Runner'
import './account-recovery.css'

interface Props {
  message: string
  needsSignIn?: boolean
  offline: boolean
  onRetry: () => void
  onContinue: () => void
}

/** One focused recovery state instead of showing an account failure over unrelated pages. */
export function AccountRecovery({ message, needsSignIn = false, offline, onRetry, onContinue }: Props) {
  const heading = needsSignIn ? 'Let’s reconnect your account'
    : offline ? 'You’re offline' : 'A small connection hiccup'
  return (
    <section className="account-recovery panel" role="alert" aria-labelledby="account-recovery-title">
      <div className="account-recovery-visual" aria-hidden="true">
        <Runner pose="crouch" size={56} />
      </div>
      <div className="account-recovery-copy">
        <p className="account-recovery-kicker">Your training can wait a moment</p>
        <h2 id="account-recovery-title">{heading}</h2>
        <p>{message}</p>
        <p className="field-help">Anything saved on this device will stay here while we reconnect.</p>
        <div className="submit-row">
          <button type="button" className="button button-primary" onClick={needsSignIn ? onContinue : onRetry}>
            {needsSignIn ? 'Continue securely' : offline ? 'Try again when online' : 'Try again'}
          </button>
          {needsSignIn && <button type="button" className="button button-quiet" onClick={onRetry}>Retry connection</button>}
        </div>
        <p className="field-help account-recovery-support">
          Still not working? <a href="mailto:hello@taperday.run">Contact support</a>
        </p>
      </div>
    </section>
  )
}
