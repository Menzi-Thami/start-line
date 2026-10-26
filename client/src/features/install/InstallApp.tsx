import { useEffect, useRef, useState } from 'react'
import { useInstallWay, type InstallWay } from '../../lib/install-app'


/** Safari's Share icon, as it looks in the toolbar, so it's easy to spot. */
const ShareIcon = ({ className = 'install-share' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
    <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" />
    <path d="M6 9H4.5v8.5h11V9H14" />
  </svg>
)

/** The Add to Home Screen icon in Safari's share sheet: a plus in a rounded square. */
const AddIcon = () => (
  <svg className="install-share" viewBox="0 0 20 20" aria-hidden="true">
    <rect x="3" y="3" width="14" height="14" rx="3.5" />
    <path d="M10 6.5v7M6.5 10h7" />
  </svg>
)

/** Where the browser's Share button is: the bottom toolbar in Safari on an iPhone, at the top on an iPad or in Chrome. */
function shareIsAtTheBottom(): boolean {
  const agent = navigator.userAgent
  return /iPhone|iPod/.test(agent) && !/CriOS|FxiOS|EdgiOS/.test(agent)
}

/**
 * The guide for a browser that can't add Taperday by itself. An iPhone can only add a website from its Share menu, and
 * Apple lets no website open that for it, so this points at the button and shows the exact row to tap; anything else is
 * told where its browser's menu is. Escape, the backdrop or Got it closes it.
 */
function Guide({ ios, onClose }: { ios: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const atBottom = ios && shareIsAtTheBottom()
  return (
    <div className="install-guide">
      <div className="install-guide-scrim" aria-hidden="true" onClick={onClose} />
      <div ref={panel} className="install-guide-panel" role="dialog" aria-modal="true" aria-labelledby="install-guide-title" tabIndex={-1}>
        <h2 id="install-guide-title" className="home-card-heading">
          {ios ? 'Two taps and it’s on your home screen' : 'One step and it’s on your home screen'}
        </h2>
        {ios ? (
          <ol className="install-guide-steps">
            <li>
              <span className="install-guide-number">1</span>
              <span>
                Tap <ShareIcon /> <strong>Share</strong> {atBottom ? 'in the toolbar at the bottom' : 'at the top of the screen'}
                <span className="field-help install-guide-hint">On newer iPhones it’s inside the ⋯ button.</span>
              </span>
            </li>
            <li>
              <span className="install-guide-number">2</span>
              <span>
                Scroll down and tap
                <span className="install-guide-row">
                  <AddIcon /> Add to Home Screen
                </span>
              </span>
            </li>
          </ol>
        ) : (
          <p>
            Open your browser’s menu (<strong>⋮</strong> or <strong>⋯</strong>) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
          </p>
        )}
        <button type="button" className="button" onClick={onClose}>
          Got it
        </button>
      </div>
      {atBottom && (
        <span className="install-guide-arrow" aria-hidden="true">
          <ShareIcon className="install-guide-arrow-icon" />
          <span className="install-guide-arrow-head">↓</span>
        </span>
      )}
    </div>
  )
}

/**
 * One button wherever Taperday isn't on the home screen yet: it installs straight away where the browser allows (Android,
 * desktop Chrome and Edge), and opens the two-tap guide everywhere else.
 */
function AddButton({ way, onInstalled, big = false }: { way: InstallWay; onInstalled?: () => void; big?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [guide, setGuide] = useState(false)
  if (way.kind === 'installed') return <p className="field-help">It’s on your home screen.</p>
  const add = () => {
    if (way.kind !== 'prompt') {
      setGuide(true)
      return
    }
    setBusy(true)
    way
      .install()
      .then((accepted) => accepted && onInstalled?.())
      .finally(() => setBusy(false))
  }
  return (
    <>
      <button type="button" className={big ? 'button install-button' : 'button'} disabled={busy} onClick={add}>
        Add to home screen
      </button>
      {guide && <Guide ios={way.kind === 'ios'} onClose={() => setGuide(false)} />}
    </>
  )
}

/**
 * The banner at the top of Home and of a plan: shown wherever adding takes a tap or two (a browser offering install, or
 * an iPhone), every time, until the app is on the home screen. There's no Not now: once it's installed it goes for
 * good, and opening Taperday from the home screen never shows it. Account has the same button.
 */
export function InstallCard() {
  const way = useInstallWay()
  if (way.kind !== 'prompt' && way.kind !== 'ios') return null
  return (
    <section className="panel install-card" aria-labelledby="install-card">
      <img className="install-icon" src="/home-icon-192.png" alt="" width="64" height="64" />
      <div className="install-body">
        <h2 id="install-card" className="home-card-heading">
          Put Taperday on your home screen
        </h2>
        <p className="install-pitch">One tap opens your plan, full screen like an app, with today’s run waiting.</p>
        <div className="install-actions">
          <AddButton way={way} big />
        </div>
      </div>
    </section>
  )
}

/** In Account, always: the same button, for whenever the runner wants it. */
export function InstallSection() {
  const way = useInstallWay()
  return (
    <section className="section" aria-labelledby="install-section">
      <h3 id="install-section">Taperday on your home screen</h3>
      <AddButton way={way} />
    </section>
  )
}
