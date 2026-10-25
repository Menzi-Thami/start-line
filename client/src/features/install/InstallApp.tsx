import { useState } from 'react'
import { useInstallWay, type InstallWay } from '../../lib/install-app'
import { loadInstallDismissed, saveInstallDismissed } from '../../lib/storage'

const PITCH = 'Opens full screen like an app, straight onto your plan. No app store, nothing to pay.'

/** Safari's Share icon, as it looks in the toolbar, so the step is easy to find. */
const ShareIcon = () => (
  <svg className="install-share" viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" />
    <path d="M6 9H4.5v8.5h11V9H14" />
  </svg>
)

function HowTo({ way, onInstalled }: { way: InstallWay; onInstalled?: () => void }) {
  const [busy, setBusy] = useState(false)
  if (way.kind === 'prompt') {
    return (
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => {
          setBusy(true)
          way
            .install()
            .then((accepted) => accepted && onInstalled?.())
            .finally(() => setBusy(false))
        }}
      >
        Add to home screen
      </button>
    )
  }
  if (way.kind === 'ios') {
    return (
      <ol className="install-steps">
        <li>
          In Safari, tap Share <ShareIcon />
        </li>
        <li>Choose Add to Home Screen, then Add</li>
      </ol>
    )
  }
  if (way.kind === 'menu') {
    return <p className="field-help">In your browser’s menu, choose Install app or Add to Home screen.</p>
  }
  return <p className="field-help">Taperday is on your home screen. Open it from there for the full-screen app.</p>
}

/**
 * The one-time card on Home: shown only where adding takes a tap or two (a browser offering install, or an iPhone), and
 * never again on this device once the runner says Not now. Account always has the option.
 */
export function InstallCard() {
  const way = useInstallWay()
  const [dismissed, setDismissed] = useState(loadInstallDismissed)
  if (dismissed || (way.kind !== 'prompt' && way.kind !== 'ios')) return null
  const dismiss = () => {
    saveInstallDismissed()
    setDismissed(true)
  }
  return (
    <section className="panel install-card" aria-labelledby="install-card">
      <img className="install-icon" src="/app-icon-192.png" alt="" width="48" height="48" />
      <div className="install-body">
        <h2 id="install-card" className="home-card-heading">
          Put Taperday on your home screen
        </h2>
        <p className="field-help">{PITCH}</p>
        <div className="install-actions">
          <HowTo way={way} onInstalled={dismiss} />
          <button type="button" className="link-button" onClick={dismiss}>
            Not now
          </button>
        </div>
      </div>
    </section>
  )
}

/** In Account, always: the same option, for whenever the runner wants it. */
export function InstallSection() {
  const way = useInstallWay()
  return (
    <section className="section" aria-labelledby="install-section">
      <h3 id="install-section">Taperday on your home screen</h3>
      {way.kind !== 'installed' && <p>{PITCH}</p>}
      <HowTo way={way} />
    </section>
  )
}
