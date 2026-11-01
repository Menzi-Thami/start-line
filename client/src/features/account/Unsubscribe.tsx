import { useState } from 'react'
import { api, ApiError } from '../../lib/api-client'

interface Props {
  /** The key from the email's link (?t=). Missing or cut short when a mail app mangled the link. */
  token: string | null
  onOpenAccount: () => void
  /** The weekly recap's link says so (?list=weekly), for the wording. Which emails stop is in the key itself. */
  weekly?: boolean
}

type Status = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string; broken: boolean }

const BROKEN_LINK = 'That unsubscribe link didn’t work: it may have been cut short. Sign in and turn updates off in Account instead.'

/**
 * Where an email's Unsubscribe link lands. No sign-in: the key in the link is enough. It asks before it acts, so a mail
 * scanner that opens every link in an email can't unsubscribe anyone by visiting.
 */
export function Unsubscribe({ token, onOpenAccount, weekly = false }: Props) {
  const [status, setStatus] = useState<Status>(token ? { kind: 'idle' } : { kind: 'error', message: BROKEN_LINK, broken: true })

  const unsubscribe = async () => {
    if (!token) return
    setStatus({ kind: 'sending' })
    try {
      await api.unsubscribe(token)
      setStatus({ kind: 'done' })
    } catch (error) {
      // A 400 means the key itself is wrong; anything else (offline, a sleeping server) is worth another go.
      const broken = error instanceof ApiError && error.status === 400
      setStatus({ kind: 'error', broken, message: broken ? BROKEN_LINK : error instanceof Error ? error.message : 'That didn’t work. Try again.' })
    }
  }

  return (
    <section className="panel" aria-labelledby="unsubscribe-title" style={{ maxWidth: '32rem', margin: '0 auto' }}>
      <p className="plan-kicker">Emails</p>
      <h2 className="plan-title" id="unsubscribe-title">
        {status.kind === 'done' ? (weekly ? 'No more weekly recaps' : 'No more update emails') : weekly ? 'Stop the weekly recap' : 'Unsubscribe from updates'}
      </h2>

      {status.kind === 'done' ? (
        <p className="plan-focus" role="status">
          You’re unsubscribed. You can turn {weekly ? 'the weekly recap' : 'updates'} back on in{' '}
          <button type="button" className="link-button" onClick={onOpenAccount}>
            Account
          </button>
          .
        </p>
      ) : (
        <>
          <p className="plan-focus">{weekly ? 'Stop the weekly recap of your running. Your account, plans, reminders and other emails stay just as they are.' : 'Stop Taperday’s news and update emails. Your account, plans and reminders stay just as they are.'}</p>
          {status.kind === 'error' && (
            <p className="field-error" role="alert">
              {status.message}
            </p>
          )}
          {token && !(status.kind === 'error' && status.broken) && (
            <div className="submit-row" style={{ marginTop: 'var(--space-4)' }}>
              <button
                type="button"
                className="button button-primary"
                onClick={unsubscribe}
                disabled={status.kind === 'sending'}
                aria-busy={status.kind === 'sending'}
              >
                {status.kind === 'sending' ? 'Unsubscribing…' : 'Unsubscribe'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
