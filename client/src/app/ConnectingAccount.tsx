import './connecting-account.css'
import { Runner } from '../features/shared/Runner'

/** While the sign-in code loads: the warm-up runner on a moving track, centred, instead of a bare line of text. */
export function ConnectingAccount() {
  return (
    <div className="connecting-account" role="status" aria-live="polite">
      <div className="connecting-account-visual" aria-hidden="true">
        <span className="connecting-account-track" />
        <Runner pose="sprint" size={56} />
      </div>
      <p className="connecting-account-label">Connecting your account</p>
    </div>
  )
}
